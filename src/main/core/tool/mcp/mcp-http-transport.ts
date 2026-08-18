/**
 * mcp-http-transport.ts — MCP Streamable HTTP transport
 *
 * Implements the MCP spec (2025-03-26 Streamable HTTP):
 * - POST {endpoint} sends JSON-RPC requests, headers:
 *     Accept: application/json, text/event-stream
 *     Content-Type: application/json
 *     Mcp-Protocol-Version: 2025-03-26（服务端可能要求）
 *     Mcp-Session-Id: <sid>（初始化后）
 * - 初始化：POST initialize → 响应头 Mcp-Session-Id 记录，后续请求携带
 * - 响应体：可能是 application/json（单 JSON-RPC 响应）
 *            或 text/event-stream（SSE：event: message / data: {...}）
 * - 工具发现走 initialize → tools/list，工具调用走 tools/call
 */
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpCallResult,
  McpServerConfig,
  McpToolDefinition,
} from '../types'

/** MCP 协议版本（2025-03-26 Streamable HTTP） */
export const PROTOCOL_VERSION = '2025-03-26'
/** 请求超时 */
const REQUEST_TIMEOUT_MS = 15000

/** HTTP MCP 传输 */
export class HttpTransport {
  private baseUrl = ''
  private sessionId: string | null = null
  private idCounter = 0
  private _connected = false

  get connected(): boolean {
    return this._connected
  }

  async connect(config: McpServerConfig): Promise<void> {
    if (!config.url) {
      throw new Error('MCP http transport requires a url')
    }
    this.baseUrl = config.url.replace(/\/+$/, '')
    this._connected = true
    // MCP initialize 握手（HTTP 必须：服务端通过 initialize 分配 session id）
    await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'tinker-agent-desktop', version: '1.0.0' },
    }).catch(() => { /* 部分服务端不强制，忽略 */ })
  }

  async request(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
    if (!this._connected || !this.baseUrl) {
      throw new Error('MCP not connected')
    }

    const id = ++this.idCounter
    const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

    const headers: Record<string, string> = {
      'Accept': 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'Mcp-Protocol-Version': PROTOCOL_VERSION,
    }
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId
    }

    const { status, headers: resHeaders, body } = await this.post(this.baseUrl, headers, JSON.stringify(req))

    // 记录 session id（初始化响应头）
    const newSessionId = resHeaders['mcp-session-id']
    if (newSessionId) {
      this.sessionId = newSessionId
    }

    if (status < 200 || status >= 300) {
      throw new Error(`MCP HTTP error ${status}: ${body.slice(0, 500)}`)
    }

    // 响应可能是 SSE（text/event-stream）或纯 JSON
    const contentType = resHeaders['content-type'] ?? ''
    if (contentType.includes('text/event-stream')) {
      const parsed = this.parseSse(body)
      if (parsed.error) throw new Error(parsed.error.message || 'MCP error')
      return parsed
    }

    let parsed: JsonRpcResponse
    try {
      parsed = JSON.parse(body) as JsonRpcResponse
    } catch {
      throw new Error(`MCP invalid JSON response: ${body.slice(0, 500)}`)
    }
    if (parsed.error) throw new Error(parsed.error.message || 'MCP error')
    return parsed
  }

  async listTools(): Promise<McpToolDefinition[]> {
    const res = await this.request('tools/list')
    const tools = (res.result as { tools?: McpToolDefinition[] })?.tools ?? []
    return tools
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult> {
    const res = await this.request('tools/call', { name, arguments: args })
    const result = res.result as { content?: Array<{ type: string; text?: string; data?: unknown }>; isError?: boolean } | undefined
    return { content: result?.content ?? [], isError: result?.isError ?? false }
  }

  close(): void {
    this._connected = false
    this.sessionId = null
  }

  /** POST JSON，返回状态码 + 响应头 + 响应体 */
  private post(url: string, headers: Record<string, string>, body: string): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url)
      const mod = parsed.protocol === 'https:' ? httpsRequest : httpRequest
      const req = mod(
        url,
        {
          method: 'POST',
          headers,
          timeout: REQUEST_TIMEOUT_MS,
        },
        (res: { statusCode?: number; headers: Record<string, string | string[] | undefined>; on: (ev: string, cb: (chunk: Buffer) => void) => void }) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            // 规范化响应头（小写 key，数组取第一个）
            const h: Record<string, string> = {}
            for (const [k, v] of Object.entries(res.headers)) {
              h[k.toLowerCase()] = Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
            }
            resolve({ status: res.statusCode ?? 0, headers: h, body: Buffer.concat(chunks).toString('utf-8') })
          })
        }
      )
      req.on('error', (err: Error) => reject(err))
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('MCP HTTP request timeout'))
      })
      req.write(body)
      req.end()
    })
  }

  /** 解析 SSE 流（event: message / data: {...}），取最后一个 message 事件 */
  private parseSse(body: string): JsonRpcResponse {
    const messages: JsonRpcResponse[] = []
    const lines = body.split('\n')
    let currentData = ''
    let currentEvent = ''

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        currentData += line.slice(5).trim()
        // 尝试解析（data 可能是多行，这里简化单行 JSON）
        if (currentEvent === 'message' && currentData) {
          try {
            messages.push(JSON.parse(currentData) as JsonRpcResponse)
          } catch { /* 忽略非 JSON data */ }
          currentData = ''
          currentEvent = ''
        }
      } else if (line === '') {
        // 空行 = 事件结束；若 data 有内容且事件是 message
        if (currentEvent === 'message' && currentData) {
          try {
            messages.push(JSON.parse(currentData) as JsonRpcResponse)
          } catch { /* 忽略 */ }
        }
        currentData = ''
        currentEvent = ''
      }
    }

    // 取最后一个 message（对应当前请求 id）
    const last = messages[messages.length - 1]
    if (!last) {
      throw new Error(`MCP SSE response with no message event: ${body.slice(0, 300)}`)
    }
    return last
  }
}
