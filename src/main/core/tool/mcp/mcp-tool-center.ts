/**
 * tool/mcp-tool-center.ts — MCP tool center (local)
 *
 * Responsibilities:
 *   1. manage MCP server configs (connect + discover tools + status)
 *   2. wrap discovered MCP tools as McpTool (IAgentTool-isomorphic instances),
 *      由 bootstrap 注册进 ToolManager 统一注册中心。
 *
 * TinkerAgent → ToolManager.execute →（toolType=mcp）→ McpTool.execute → mcpManager
 */
import { ToolCenterRepository } from '../../../repository/tool-center-repository'
import { nowIso } from '../../../utils/time'
import type { ToolManager } from '../tool-manager'
import type { McpServerConfig, McpServerState, ToolCenterState } from '../types'
import { TOOL_TYPE_MCP } from '../types'
import { mcpManager } from './mcp-manager'
import { McpTool } from './mcp-tool'

/** MCP 工具注册中心（生成 McpTool 实例 + 管理服务器配置） */
export class McpToolCenter {
  private _mcpServers: McpServerState[] = []

  /** ToolManager 引用：连接后把 McpTool 实例注册进统一注册中心 */
  private toolManager: ToolManager | null = null

  constructor(private readonly repo: ToolCenterRepository) { }

  /** 接入 ToolManager（bootstrap 组装时调用） */
  attachToolManager(toolManager: ToolManager): void {
    this.toolManager = toolManager
    this.syncToolsToManager()
  }

  /** 将当前已连接的 MCP 工具注册进 ToolManager（连接/重连后调用） */
  private syncToolsToManager(): void {
    if (!this.toolManager) return
    for (const tool of this.getMcpTools()) {
      this.toolManager.register({
        meta: { name: tool.name, emoji: '🔌', toolType: TOOL_TYPE_MCP },
        tool,
      })
    }
  }

  /** 初始化：从仓库加载 MCP 配置（主库已由应用启动时初始化） */
  async initDb(): Promise<void> {
    // 主库（node:sqlite）在 app 启动时统一初始化，无需额外动作
  }

  /**
   * 启动恢复：从数据库加载已注册的 MCP 工具定义，
   * 调用 mcpManager.checkRegistered 检测对应服务器可用性，
   * 可用服务器的工具注册进 ToolManager（无需重新 discover）。
   */
  async restoreFromDb(): Promise<void> {
    const rows = this.repo.loadMcpTools()
    if (rows.length === 0) return

    const configs = this.loadMcpConfigs()
    const available = await mcpManager.checkRegistered(configs)
    // 同步服务器状态（设置页展示）
    this._mcpServers = configs.map((c) => ({
      ...c,
      connected: available.has(c.name),
      lastCheck: nowIso(),
      tools: rows.filter((r) => r.serverName === c.name && r.enabled === 1).map((r) => ({
        name: r.toolName,
        description: r.description,
        inputSchema: JSON.parse(r.inputSchema || '{}') as Record<string, unknown>,
      })),
    }))

    // 可用服务器的工具 → 注册
    if (this.toolManager) {
      for (const r of rows) {
        if (r.enabled !== 1 || !available.has(r.serverName)) continue
        this.toolManager.register({
          meta: { name: r.name, emoji: '🔌', toolType: TOOL_TYPE_MCP },
          tool: new McpTool(r.serverName, r.toolName, r.description, JSON.parse(r.inputSchema || '{}') as Record<string, unknown>, mcpManager),
        })
      }
    }
  }

  /** 连接全部 MCP 服务器并发现工具（首次：发现后存库） */
  async initialize(): Promise<ToolCenterState> {
    const configs = this.loadMcpConfigs()
    this._mcpServers = await mcpManager.discoverAll(configs)
    this.syncToolsToManager()
    // 首次发现：持久化工具定义（重启从库加载）
    this.persistDiscoveredTools()
    return this.getState()
  }

  /** 仅重连 MCP（配置变更后调用） */
  async recheckMcp(): Promise<ToolCenterState> {
    const configs = this.loadMcpConfigs()
    this._mcpServers = await mcpManager.discoverAll(configs)
    this.syncToolsToManager()
    this.persistDiscoveredTools()
    return this.getState()
  }

  /** 将当前发现的工具定义写入 mcp_tools 表 */
  private persistDiscoveredTools(): void {
    const tools = this.getMcpTools().map((t) => ({
      name: t.name,
      serverName: t.serverName,
      toolName: t.toolName,
      description: t.description,
      inputSchema: t.inputSchema,
    }))
    this.repo.saveMcpTools(tools)
  }

  /** 获取当前状态快照（renderer 设置页用） */
  getState(): ToolCenterState {
    return { builtin: [], mcpServers: this._mcpServers, updatedAt: nowIso() }
  }

  /** 获取 MCP 服务器状态列表 */
  getMcpServers(): McpServerState[] {
    return [...this._mcpServers]
  }

  /**
   * 生成全部 MCP 工具实例（McpTool，IAgentTool 同构）。
   * 供 bootstrap 注册进 ToolManager 统一注册中心。
   */
  getMcpTools(): McpTool[] {
    const tools: McpTool[] = []
    for (const s of this._mcpServers) {
      if (!s.connected) continue
      for (const t of s.tools) {
        tools.push(new McpTool(s.name, t.name, t.description, t.inputSchema, mcpManager))
      }
    }
    return tools
  }

  // ── MCP 服务器配置管理 ──

  /** 添加/更新 MCP 服务器（配置变更后重新连接） */
  async upsertMcpServer(config: McpServerConfig): Promise<ToolCenterState> {
    this.repo.addMcpServer(config)
    return this.recheckMcp()
  }

  /** 删除 MCP 服务器 */
  async removeMcpServer(name: string): Promise<ToolCenterState> {
    this.repo.deleteMcpServer(name)
    return this.recheckMcp()
  }

  /** 获取 MCP 服务器配置列表 */
  getMcpServerConfigs(): McpServerConfig[] {
    return this.loadMcpConfigs()
  }

  /** 从仓库加载 MCP 配置（McpServerRow → McpServerConfig） */
  private loadMcpConfigs(): McpServerConfig[] {
    return this.repo.loadMcpServers().map((r) => ({
      name: r.name,
      transport: r.transport as 'stdio' | 'http',
      command: r.command ?? undefined,
      args: JSON.parse(r.argsJson || '[]') as string[],
      url: r.url ?? undefined,
      enabled: r.enabled === 1,
    }))
  }

  /** 关闭 */
  dispose(): void {
    mcpManager.disconnectAll()
  }
}

/** MCP 工具注册中心单例（bootstrap 组装时调用） */
let _center: McpToolCenter | null = null

export function getMcpToolCenter(): McpToolCenter {
  if (!_center) {
    _center = new McpToolCenter(new ToolCenterRepository())
  }
  return _center
}
