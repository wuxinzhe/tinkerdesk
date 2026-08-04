/**
 * center-types.ts — 工具注册中心共享类型
 *
 * 定义 Built-in 工具和 MCP 工具的注册表条目。
 * 用于持久化存储、IPC 传递、以及服务端注册。
 */
import type { ToolSchema } from '@/defines/tools/base-tool'

// ── Built-in 工具检查结果 ──

export interface CheckedTool {
  id: string
  name: string
  description: string
  category: string
  source: 'builtin'
  available: boolean
  reason?: string
  schema: ToolSchema
}

// ── MCP 服务器配置（跨 session 持久化）──

export interface McpServerConfig {
  name: string
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
  enabled: boolean
}

// ── MCP 服务器状态（运行时）──

export interface McpServerState extends McpServerConfig {
  connected: boolean
  lastCheck: string | null
  error?: string
  tools: McpDiscoveredTool[]
}

export interface McpDiscoveredTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

// ── 统一工具定义（用于 register_tools 上报服务端）──

export interface RegisteredTool {
  id: string
  name: string
  description: string
  category: string
  available: boolean
  schema: ToolSchema
  /** MCP 工具的服务器配置名（仅 MCP 来源有效） */
  serverName?: string
}

// ── ToolCenter 状态快照（主进程→渲染进程）──

export interface ToolCenterState {
  builtin: CheckedTool[]
  mcpServers: McpServerState[]
  allAvailable: RegisteredTool[]
  updatedAt: string
}
