/**
 * utils/http.ts — HTTP 请求工具
 *
 * tools/desktop/web-search/web-extract 的 fetchUrl：
 * GET/POST JSON，带超时 + UA 伪装，返回文本。
 * 被 web-search-tool / web-extract-tool 共享。
 */
import { get as httpGet, type IncomingMessage, type RequestOptions } from 'http'
import { get as httpsGet } from 'https'
import { URL } from 'url'

/** 请求超时 */
const REQUEST_TIMEOUT_MS = 15000

/** 提取异常的人类可读消息（catch 变量为 unknown，不用 any） */
export function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

/** 发 HTTP 请求（GET/POST），返回响应体文本 */
export function fetchUrl(urlStr: string, headers: Record<string, string> = {}, body?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const mod = url.protocol === 'https:' ? httpsGet : httpGet
    const options: RequestOptions = {
      method: body !== undefined ? 'POST' : 'GET',
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    }
    if (body !== undefined) {
      options.headers = {
        ...options.headers,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers
      }
    } else {
      options.headers = { ...options.headers, ...headers }
    }
    const req = mod(urlStr, options, (res: IncomingMessage) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'))
      })
    })
    req.on('error', (err) => {
      reject(err)
    })
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('请求超时'))
    })
    if (body !== undefined) req.write(body)
    req.end()
  })
}
