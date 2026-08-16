/**
 * process-utils.ts — 通用进程/下载工具（不依赖插件——任意模块可用）
 *
 * downloadFile: 流式 HTTP(S) 下载（带字节进度回调——异步不阻塞主进程）
 * execFileAsync: promisify(execFile)——外部命令异步执行（不阻塞主进程）
 */
import { execFile } from 'child_process'
import { promisify } from 'util'
import { get as httpsGet } from 'https'
import { get as httpGet } from 'http'
import { createWriteStream } from 'fs'

/** 异步 execFile（外部命令——不阻塞主进程） */
export const execFileAsync = promisify(execFile)

/** 下载文件（流式——带进度回调——不阻塞主进程） */
/** 国内镜像映射（下载失败回退——GitHub/HF 加速） */
export function mirrorUrl(url: string): string {
  if (url.startsWith('https://github.com/')) {
    return `https://ghfast.top/${url}`
  }
  if (url.startsWith('https://huggingface.co/')) {
    return url.replace('https://huggingface.co/', 'https://hf-mirror.com/')
  }
  if (url.startsWith('https://objects.githubusercontent.com/')) {
    return `https://ghfast.top/${url}`
  }
  return url
}

/** 下载（直连优先——失败自动回退镜像重试一次——GitHub/HF 国内源兜底） */
export async function downloadWithMirror(url: string, dest: string, onProgress?: (received: number, total: number) => void): Promise<void> {
  try {
    await downloadFile(url, dest, onProgress)
  } catch (e) {
    const mirror = mirrorUrl(url)
    if (mirror === url) throw e
    console.warn(`[plugin] 直连下载失败（${(e as Error).message}）——回退镜像: ${mirror}`)
    await downloadFile(mirror, dest, onProgress)
  }
}

export function downloadFile(
  url: string,
  dest: string,
  onProgress?: (received: number, total: number) => void,
  redirects = 5,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? httpsGet : httpGet
    const req = client(url, (res) => {
      // 跟随重定向（GitHub release 等 301/302 → CDN——最多 5 跳）
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        if (redirects <= 0) {
          reject(new Error(`重定向次数过多 (${url})`))
          return
        }
        const next = new URL(res.headers.location, url).toString()
        downloadFile(next, dest, onProgress, redirects - 1).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`下载失败 HTTP ${res.statusCode} (${url})`))
        res.resume()
        return
      }
      const total = Number(res.headers['content-length'] ?? 0)
      let received = 0
      const ws = createWriteStream(dest)
      res.on('data', (chunk: Buffer) => {
        received += chunk.length
        onProgress?.(received, total)
      })
      res.pipe(ws)
      ws.on('finish', () => resolve())
      ws.on('error', reject)
    })
    req.setTimeout(60_000, () => {
      req.destroy(new Error(`下载超时: ${url}`))
    })
    req.on('error', reject)
  })
}
