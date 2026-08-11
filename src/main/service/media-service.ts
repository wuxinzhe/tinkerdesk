/**
 * media-service.ts — 聊天多媒体文件持久化（图片/音频/视频）
 *
 * 设计（与用户确认）：
 *   - 文件落盘 {userData}/media/{timestamp}_{hash8}{ext}（复制——不动用户原文件）
 *   - DB/消息只存【相对路径】media/xxx.ext（跨机器/迁移安全）
 *   - 消息文本用 Hermes 风格提示：[Image attached at: media/xxx.png]
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
 * - 前端用 app-media://media/xxx.png 展示图片/音频/视频
 */
export function registerMediaProtocol(): void {
  const { protocol, net } = require('electron') as typeof import('electron')
  protocol.handle('app-media', (request) => {
    const url = new URL(request.url)
    const pathname = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    // 只允许 media/ 前缀（相对路径形式）
    if (!pathname.startsWith('media/')) {
      return new Response('forbidden', { status: 403 })
    }
    const absPath = resolve(getMediaRoot(), pathname.slice('media/'.length))
    if (!isInsideMediaRoot(absPath) || !existsSync(absPath)) {
      return new Response('not found', { status: 404 })
    }
    return net.fetch('file://' + absPath.replace(/\\/g, '/'))
  })
}

/** 获取文件名（渲染提示用） */
export function mediaFileName(relPath: string): string {
  return basename(relPath.replace(/\\/g, '/'))
}
