/**
 * mcp-manager.ts — MCP server connection manager
 *
 * Manages external MCP server lifecycles (connect/discover/tool-call routing):
 *   - stdio transport: mcp-stdio-transport.ts (spawns a child process, stdin/stdout)
 *   - http transport: mcp-http-transport.ts (Streamable HTTP)
 *
 * 协议：JSON-RPC 2.0
 *   tools/list  → 获取工具列表（含 schema）
 *   tools/call  → 执行工具
 *
 * MCP 服务器配置由 mcp_servers 表持久化，此模块只负责运行时连接和管理。
 */
import { nowIso } from '../../../utils/time'
import type { McpCallResult, McpDiscoveredTool, McpServerConfig, McpServerState } from '../types'
import { HttpTransport } from './mcp-http-transport'
import { StdioTransport } from './mcp-stdio-transport'

export type { JsonRpcRequest, JsonRpcResponse, McpCallResult, McpToolDefinition } from '../types'

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

  /**
   * check：检测已注册 MCP 工具对应的服务器是否可用（重启时调用）。
   * 逐个连接服务器，返回可用服务器名集合。
   */
  async checkRegistered(configs: McpServerConfig[]): Promise<Set<string>> {
    const available = new Set<string>()
    for (const config of configs) {
      if (!config.enabled) continue
      try {
        const state = await this.connectToServer(config)
        if (state.connected) {
          available.add(config.name)
        }
      } catch {
        // 连接失败 → 服务器不可用，工具保持注册但执行时返回错误
      }
    }
    return available
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
      state.lastCheck = nowIso()
      state.tools = discovered
    } catch (err) {
      state.error = (err as Error).message
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

      // 按传输类型选择（stdio / http）
      const transport = config.transport === 'http' ? new HttpTransport() : new StdioTransport()
      try {
        await transport.connect(config)
        const result = await transport.callTool(toolName, args)
        return result
      } finally {
        transport.close()
      }
    }
    throw new Error(`MCP 工具未找到或服务器未连接: ${toolName}`)
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
