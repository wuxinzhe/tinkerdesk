/**
 * mcp-stdio-transport.ts — MCP stdio transport
 *
 * Spawns a child process and communicates over stdin/stdout with JSON-RPC 2.0:
 * - connect: spawn command → wait for stdout data (connection ready) → initialize handshake
 * - request: write a JSON line to stdin, match stdout responses by id
 * - listTools / callTool：MCP 标准方法
 * - close：结束子进程（SIGTERM → SIGKILL）
 */
import { spawn, type ChildProcess } from 'child_process'
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpCallResult,
  McpServerConfig,
  McpToolDefinition,
} from '../types'
import { PROTOCOL_VERSION } from './mcp-http-transport'

/** stdio MCP 传输 */
export class StdioTransport {
  private child: ChildProcess | null = null
  private pending = new Map<string | number, { resolve: (v: JsonRpcResponse) => void; reject: (e: Error) => void }>()
  private buffer = ''
  private idCounter = 0
  private _connected = false

  get connected(): boolean {
    return this._connected
  }

  async connect(config: McpServerConfig): Promise<void> {
    const cmd = config.command
    const args = config.args ?? []
    if (!cmd) throw new Error('MCP stdio transport requires a command')

    return new Promise<void>((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })
      this.child = child

      let started = false

      child.stdout?.on('data', (data: Buffer) => {
        this.buffer += data.toString()
        this.processBuffer()
        if (!started) {
          started = true
          this._connected = true
          resolve()
        }
      })

      child.stderr?.on('data', () => {
        // MCP servers often log to stderr; ignore by default
      })

      child.on('error', (err) => {
        this._connected = false
        if (!started) reject(err)
      })

      child.on('close', () => {
        this._connected = false
        // Reject any pending requests
        for (const [, pending] of this.pending) {
          pending.reject(new Error('MCP process closed'))
        }
        this.pending.clear()
      })

      // Timeout: if no data after 10s, assume connection failed
      setTimeout(() => {
        if (!started) {
          child.kill()
          reject(new Error('MCP connection timeout'))
        }
      }, 10000)
    }).then(async () => {
      // MCP initialize 握手（部分 server 要求先 initialize 再 tools/list）
      await this.request('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'tinker-agent-desktop', version: '1.0.0' },
      }).catch(() => { /* 老版本 server 可能不接受，忽略 */ })
    })
  }

  async request(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
    if (!this.child || !this._connected) {
      throw new Error('MCP not connected')
    }

    const id = ++this.idCounter
    const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.child!.stdin?.write(JSON.stringify(req) + '\n')
    }).then((res) => {
      if (res.error) throw new Error(res.error.message || 'MCP error')
      return res
    })
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
    if (this.child) {
      this.child.stdin?.end()
      this.child.kill('SIGTERM')
      setTimeout(() => { try { this.child?.kill('SIGKILL') } catch { /* ignore */ } }, 3000)
      this.child = null
    }
    this._connected = false
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n')
    while (lines.length > 1) {
      const line = lines.shift()!
      this.buffer = lines.join('\n')
      try {
        const msg: JsonRpcResponse = JSON.parse(line)
        if (msg.id != null) {
          const pending = this.pending.get(msg.id)
          if (pending) {
            this.pending.delete(msg.id)
            pending.resolve(msg)
          }
        }
      } catch {
        // Non-JSON output (e.g. startup logs), ignore
      }
    }
  }
}
