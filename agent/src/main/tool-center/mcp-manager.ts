/**
 * tool-center/mcp-manager.ts — MCP 服务器连接管理器
 *
 * 管理外部 MCP 服务器的生命周期：
 *   - stdio 协议：spawn 子进程，通过 stdin/stdout 通信
 *   - http 协议：POST 到指定 URL
 *
 * 协议：JSON-RPC 2.0
 *   tools/list  → 获取工具列表（含 schema）
 *   tools/call  → 执行工具（通过 BaseTool 包装的 execute）
 *
 * MCP 服务器配置由 db.ts 持久化，此模块只负责运行时连接和管理。
 */
import { spawn, type ChildProcess } from 'child_process'
import type { McpServerConfig, McpServerState, McpDiscoveredTool } from '@/defines/tools/center-types'

// ── JSON-RPC 工具类型 ──

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface McpToolDefinition {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

interface McpCallResult {
  content: Array<{ type: string; text?: string; data?: unknown }>
  isError?: boolean
}

// ── stdio 传输 ──

class StdioTransport {
  private child: ChildProcess | null = null
  private pending = new Map<string | number, { resolve: (v: JsonRpcResponse) => void; reject: (e: Error) => void }>()
  private buffer = ''
  private idCounter = 0
  private _connected = false

  get connected(): boolean { return this._connected }

  async connect(config: McpServerConfig): Promise<void> {
    const cmd = config.command
    const args = config.args ?? []
    if (!cmd) throw new Error('MCP stdio transport requires a command')

    return new Promise((resolve, reject) => {
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
    })
  }

  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.child || !this._connected) {
      throw new Error('MCP not connected')
    }

    const id = ++this.idCounter
    const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.child!.stdin?.write(JSON.stringify(req) + '\n')
    }).then((res: any) => {
      if (res.error) throw new Error(res.error.message || 'MCP error')
      return res.result
    })
  }

  async listTools(): Promise<McpToolDefinition[]> {
    const result = await this.request('tools/list') as any
    return result?.tools ?? []
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult> {
    const result = await this.request('tools/call', { name, arguments: args }) as any
    return { content: result?.content ?? [], isError: result?.isError ?? false }
  }

  close(): void {
    if (this.child) {
      this.child.stdin?.end()
      this.child.kill('SIGTERM')
      setTimeout(() => { try { this.child?.kill('SIGKILL') } catch {} }, 3000)
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

// ── HTTP 传输（暂未实现）──

class HttpTransport {
  async connect(_config: McpServerConfig): Promise<void> {
    throw new Error('HTTP MCP transport not yet implemented')
  }
  async listTools(): Promise<McpToolDefinition[]> {
    throw new Error('Not connected')
  }
  async callTool(_name: string, _args: Record<string, unknown>): Promise<McpCallResult> {
    throw new Error('Not connected')
  }
  close(): void {}
}

// ── MCP 管理器 ──

export class McpManager {
  private transports = new Map<string, StdioTransport | HttpTransport>()
  private servers = new Map<string, McpServerState>()

  /** 连接并发现所有已配置的 MCP 服务器 */
  async discoverAll(configs: McpServerConfig[]): Promise<McpServerState[]> {
    // 关闭旧连接
    this.disconnectAll()

    const states: McpServerState[] = []

    for (const config of configs) {
      if (!config.enabled) {
        states.push({ ...config, connected: false, lastCheck: null, tools: [] })
        continue
      }

      const state = await this.connectToServer(config)
      states.push(state)
      this.servers.set(config.name, state)
    }

    return states
  }

  /** 连接单个 MCP 服务器 */
  private async connectToServer(config: McpServerConfig): Promise<McpServerState> {
    const transport = config.transport === 'http' ? new HttpTransport() : new StdioTransport()
    const state: McpServerState = {
      ...config,
      connected: false,
      lastCheck: null,
      tools: []
    }

    try {
      await transport.connect(config)
      const tools = await transport.listTools()
      const discovered: McpDiscoveredTool[] = tools.map(t => ({
        name: t.name,
        description: t.description ?? '',
        inputSchema: t.inputSchema ?? {}
      }))

      transport.close() // 发现后断开，需要执行时才重新连接
      this.transports.set(config.name, transport)

      state.connected = true
      state.lastCheck = new Date().toISOString()
      state.tools = discovered
    } catch (err: any) {
      state.error = err.message
    }

    return state
  }

  /** 执行 MCP 工具（按名称路由到对应的服务器） */
  async executeTool(toolName: string, args: Record<string, unknown>): Promise<McpCallResult> {
    // 查找包含该工具的服务器
    for (const [serverName, state] of this.servers) {
      if (!state.connected || !state.tools.some(t => t.name === toolName)) continue

      const config: McpServerConfig = {
        name: serverName,
        transport: state.transport,
        command: state.command,
        args: state.args,
        url: state.url,
        enabled: true
      }

      const transport = new StdioTransport()
      try {
        await transport.connect(config)
        const result = await transport.callTool(toolName, args)
        return result
      } finally {
        transport.close()
      }
    }

    throw new Error(`MCP tool '${toolName}' not found in any connected server`)
  }

  /** 断开所有 MCP 连接 */
  disconnectAll(): void {
    for (const [, transport] of this.transports) {
      transport.close()
    }
    this.transports.clear()
    this.servers.clear()
  }

  /** 获取当前 MCP 服务器状态 */
  getServerStates(): McpServerState[] {
    return Array.from(this.servers.values())
  }
}

/** 全局单例 */
export const mcpManager = new McpManager()
