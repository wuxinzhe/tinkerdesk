/**
 * tool-center/desktop-center.ts — DesktopToolCenter 编排器
 *
 * 统一管理 Desktop 端工具注册流程：
 *   1. 检测 built-in 工具可用性
 *   2. 连接 MCP 服务器并发现工具
 *   3. 合并两类工具，生成注册快照
 *   4. 持久化到 SQLite
 *
 * 渲染进程通过 IPC 调用此模块获取状态。
 */
import { checkAllBuiltinTools, resetBuiltinCache } from './builtin-checker'
import { mcpManager } from './mcp-manager'
import { initDatabase, saveToolRegistry, loadToolRegistry, loadMcpServers, saveMcpServers } from './db'
import type { CheckedTool, McpServerConfig, McpServerState, RegisteredTool, ToolCenterState } from '@/defines/tools/center-types'

export class DesktopToolCenter {
  private _builtin: CheckedTool[] = []
  private _mcpServers: McpServerState[] = []
  private initialized = false

  /** 初始化数据库 */
  async initDb(): Promise<void> {
    await initDatabase()
  }

  /** 执行完整的工具检测流程 */
  async initialize(): Promise<ToolCenterState> {
    resetBuiltinCache()
    this.initialized = true

    // 1. 检测 built-in 工具
    this._builtin = await checkAllBuiltinTools()
    saveToolRegistry(this._builtin)

    // 2. 加载 MCP 配置并检测
    const configs = loadMcpServers()
    this._mcpServers = await mcpManager.discoverAll(configs)

    return this.getState()
  }

  /** 仅重检 MCP（不需要重新检测 built-in） */
  async recheckMcp(): Promise<ToolCenterState> {
    const configs = loadMcpServers()
    this._mcpServers = await mcpManager.discoverAll(configs)
    return this.getState()
  }

  /** 获取当前工具注册快照 */
  getState(): ToolCenterState {
    const builtin = this._builtin
    const mcpServers = this._mcpServers

    const allAvailable: RegisteredTool[] = [
      // Built-in 可用工具
      ...builtin
        .filter(t => t.available)
        .map(t => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          available: true,
          schema: t.schema,
          serverName: 'showing'
        })),
      // MCP 可用工具
      ...mcpServers
        .filter(s => s.connected)
        .flatMap(s => s.tools.map(t => ({
          id: `mcp_${s.name}_${t.name}`,
          name: `mcp_${s.name}_${t.name}`,
          description: t.description,
          category: 'mcp',
          available: true,
          schema: mcpToolToSchema(`mcp_${s.name}_${t.name}`, t.description, t.inputSchema),
          serverName: s.name
        })))
    ]

    return { builtin, mcpServers, allAvailable, updatedAt: new Date().toISOString() }
  }

  /** 获取 built-in 工具列表 */
  getBuiltinTools(): CheckedTool[] {
    return [...this._builtin]
  }

  /** 获取 MCP 服务器状态 */
  getMcpServers(): McpServerState[] {
    return [...this._mcpServers]
  }

  // ── MCP 服务器配置管理 ──

  /** 添加/更新 MCP 服务器 */
  async upsertMcpServer(config: McpServerConfig): Promise<ToolCenterState> {
    const { addMcpServer } = await import('./db')
    addMcpServer(config)
    return this.recheckMcp()
  }

  /** 删除 MCP 服务器 */
  async removeMcpServer(name: string): Promise<ToolCenterState> {
    const { deleteMcpServer } = await import('./db')
    deleteMcpServer(name)
    return this.recheckMcp()
  }

  /** 获取 MCP 服务器配置列表 */
  getMcpServerConfigs(): McpServerConfig[] {
    return loadMcpServers()
  }

  /** 执行 MCP 工具 */
  async executeMcpTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    return mcpManager.executeTool(toolName, args)
  }

  /** 关闭 */
  dispose(): void {
    mcpManager.disconnectAll()
    const { closeDatabase } = require('./db')
    closeDatabase()
    this.initialized = false
  }
}

// ── 工具函数 ──

function mcpToolToSchema(name: string, description: string, inputSchema: Record<string, unknown>): any {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: inputSchema?.properties
        ? { type: 'object', ...inputSchema }
        : { type: 'object', properties: {}, required: [] }
    },
    toolType: 'mcp-ext'
  }
}
