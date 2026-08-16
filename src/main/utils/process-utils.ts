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
export function downloadFile(
  url: string,
  dest: string,
  onProgress?: (received: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? httpsGet : httpGet
    const req = client(url, (res) => {
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
