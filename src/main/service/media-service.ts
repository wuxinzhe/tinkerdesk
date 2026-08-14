/**
 * media-service.ts — 聊天多媒体文件持久化（图片/音频/视频）
 *
 * Design (confirmed with user):
 *   - files land in {userData}/media/{timestamp}_{hash8}{ext} (copied — user's original untouched)
 *   - DB/messages store only the relative path media/xxx.ext (cross-machine/migration safe)
 *   - 消息文本用 提示：[Image attached at: media/xxx.png]
 *   - 发给 LLM 前：相对路径 → 绝对路径 → base64（图片）
 *   - 渲染：app-media://media/xxx.ext 自定义协议（只读 media 目录——CSP 安全）
 */
import { app } from 'electron'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join, resolve, sep } from 'node:path'
/** media 根目录（{userData}/media） */
export function getMediaRoot(): string {
  return join(app.getPath('userData'), 'media')
}

/** 确保 media 目录存在 */
export function ensureMediaRoot(): string {
  const root = getMediaRoot()
  if (!existsSync(root)) {
    const { mkdirSync } = require('node:fs') as typeof import('node:fs')
    mkdirSync(root, { recursive: true })
  }
  return root
}

/**
 * 导入媒体文件：复制到 media 目录 → 返回相对路径（media/xxx.ext）
 * @param sourcePath 用户选择的本地文件绝对路径
 * @returns 相对路径（如 media/20260811_1430_a1b2c3d4.png）
 */
export function importMediaFile(sourcePath: string): string {
  const root = ensureMediaRoot()
  if (!sourcePath || !existsSync(sourcePath)) {
    throw new Error(`文件不存在: ${sourcePath}`)
  }
  const stat = statSync(sourcePath)
  if (!stat.isFile()) {
    throw new Error('仅支持文件: ' + sourcePath)
  }
  // 文件名：时间戳 + 内容 hash8 + 原扩展名（防重 + 唯一）
  const ext = extname(sourcePath).toLowerCase() || ''
  const hash = createHash('sha256').update(readFileSync(sourcePath)).digest('hex').slice(0, 8)
  const now = new Date()
  const ts = [
    now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'),
    '_', String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0'),
  ].join('')
  const fileName = `${ts}_${hash}${ext}`
  const target = join(root, fileName)
  if (!existsSync(target)) {
    copyFileSync(sourcePath, target)
  }
  return `media/${fileName}`
}

/** 相对路径（media/xxx）→ 绝对路径；已经是绝对路径则原样 */
export function resolveMediaPath(relPath: string): string {
  if (!relPath) return ''
  const normalized = relPath.replace(/\\/g, '/')
  if (normalized.startsWith('app-media://')) {
    return resolve(getMediaRoot(), normalized.replace(/^app-media:\/\//, ''))
  }
  if (normalized.startsWith('media/')) {
    return resolve(getMediaRoot(), normalized.slice('media/'.length))
  }
  return resolve(relPath)
}

/** 文件 → base64 data URL（发给多模态 LLM 用） */
export function mediaFileToDataUrl(absPath: string): string {
  if (!existsSync(absPath)) {
    throw new Error(`媒体文件不存在: ${absPath}`)
  }
  const mimeByExt: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  }
  const mime = mimeByExt[extname(absPath).toLowerCase()] ?? 'application/octet-stream'
  const base64 = readFileSync(absPath).toString('base64')
  return `data:${mime};base64,${base64}`
}

/** 检查路径是否在 media 目录内（app-media:// 协议安全校验） */
export function isInsideMediaRoot(absPath: string): boolean {
  const root = resolve(getMediaRoot()) + sep
  return resolve(absPath).startsWith(root)
}

/**
 * 注册 app-media:// 自定义协议（渲染聊天消息里的媒体附件）
 * - 只允许读取 media 目录内文件（防任意文件读取）
 * - 显式返回 Content-Type（net.fetch(file://) 的 MIME 推断不可靠——audio/video 元素
 *   对 MIME 严格要求，MIME 缺失/错误 → MEDIA_ELEMENT_ERROR: Format error）
 */
export function registerMediaProtocol(): void {
  const { protocol } = require('electron') as typeof import('electron')
  protocol.handle('app-media', (request) => {
    const url = new URL(request.url)
    // app-media://media/xxx.png → host=media, pathname=/xxx.png（media 在 host——合并为相对路径）
    const host = url.host
    const pathname = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const relPath = host ? `${host}/${pathname}` : pathname
    // 只允许 media/ 前缀（相对路径形式）
    if (!relPath.startsWith('media/')) {
      return new Response('forbidden', { status: 403 })
    }
    const absPath = resolve(getMediaRoot(), relPath.slice('media/'.length))
    if (!isInsideMediaRoot(absPath) || !existsSync(absPath)) {
      return new Response('not found', { status: 404 })
    }
    const mime = MIME_BY_EXT[extname(absPath).toLowerCase()] ?? 'application/octet-stream'
    const fileSize = statSync(absPath).size
    // media 元素播放依赖 Range 请求（时长/进度/seek）——不支持会导致时长渐进异常 + 控件卡死
    const range = request.headers.get('Range')
    if (range && /^bytes=/.test(range)) {
      const match = /bytes=(\d*)-(\d*)/.exec(range)
      const start = match && match[1] ? Math.max(0, parseInt(match[1], 10)) : 0
      const end = match && match[2] ? Math.min(fileSize - 1, parseInt(match[2], 10)) : fileSize - 1
      if (start <= end && start < fileSize) {
        const chunk = readFileSync(absPath).subarray(start, end + 1)
        return new Response(chunk, {
          status: 206,
          headers: {
            'Content-Type': mime,
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunk.length),
            'Cache-Control': 'no-cache',
          },
        })
      }
    }
    return new Response(readFileSync(absPath), {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(fileSize),
        'Cache-Control': 'no-cache',
      },
    })
  })
}

/** 扩展名 → MIME（图片/音频/视频——显式返回供 audio/video 元素解码） */
const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.flac': 'audio/flac',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
}

/** 获取文件名（渲染提示用） */
export function mediaFileName(relPath: string): string {
  return basename(relPath.replace(/\\/g, '/'))
}
