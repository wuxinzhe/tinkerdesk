/**
 * types.ts — Agent tool system unified type definitions
 *
 * Type definitions (interfaces/type aliases) only; class implementations live
 * in separate files:
 * - ToolSchema → tool-schema.ts
 * - ToolResult → tool-result.ts
 */
import type {ToolCall} from '../llm/types'
import type {ToolSchema} from './tool-schema'
import type {ToolResult} from './tool-result'
import type {ToolContext} from '../loop/types'

// ── ToolFunction（ToolFunction） ─────────────────────────

/** OpenAI function-calling 格式中的 function 对象 */
export interface ToolFunction {
  /** 工具名称 */
  name: string
  /** 工具功能描述 */
  description: string
  /** 参数 JSON Schema 对象 */
  parameters: Record<string, unknown> | null
}

// ── ToolCall（ToolCall，复用项目已有定义） ────────────────

export type {ToolCall}

// ── IAgentTool（IAgentTool） ─────────────────────────────

/** Agent 工具 SPI 接口（所有工具需实现） */
export interface IAgentTool {
  /** 获取工具的 Schema 定义（用于向 LLM 描述工具） */
  getSchema(): ToolSchema
  /** 可选：运行时动态生成 Schema（环境感知——如 terminal 按平台枚举 shell）。
   *   ToolManager 优先调用本方法；未实现则兜底 getSchema() 静态定义。 */
  getToolSchema?(): ToolSchema
  /** 执行工具调用，返回字符串结果（将直接发送给 LLM）。入参 = loop 的 ToolContext。 */
  execute(ctx: ToolContext): Promise<ToolResult>
  /** 可用性检测（启动时调用；不可用工具不入池）。默认实现返回 true。可返回 { ok, reason } 提供不可用原因。 */
  check?(): Promise<boolean> | boolean | ToolCheckResult
}

/** 工具可用性检测结果（check 可返回——reason 给管理页 tps-tool-error 展示） */
export interface ToolCheckResult {
  ok: boolean
  /** 不可用原因（ok=false 时展示给用户） */
  reason?: string
}

// ── 工具类型常量 ─────

/** 内建工具：围绕 TinkerAgent 的核心工具（memory/todo/skill/session-search 等） */
export const TOOL_TYPE_BUILTIN = 'builtin'
/** 客户端工具：对外的普通工具（与内建走相同执行器 tool.execute） */
export const TOOL_TYPE_CLIENT = 'client'
/** 桌面工具：客户端本地工具（terminal/file/web/computer_use 等——desktop 组） */
export const TOOL_TYPE_DESKTOP = 'desktop'
/** MCP 工具：由 MCP 统一执行器（mcpManager）执行 */
export const TOOL_TYPE_MCP = 'mcp'

/** 工具类型：builtin/desktop/client 走自身执行器；mcp 走 MCP 统一执行器 */
export type ToolType = typeof TOOL_TYPE_BUILTIN | typeof TOOL_TYPE_DESKTOP | typeof TOOL_TYPE_CLIENT | typeof TOOL_TYPE_MCP

// ── 工具注册元信息（@AgentTool 注解） ────────────────────

/** 工具元信息 */
export interface AgentToolMeta {
  /** 工具名（全局唯一，不区分大小写） */
  name: string
  /** 工具类型：server = 服务端执行；desktop/web/... = 客户端工具（注册到服务端） */
  toolType?: ToolType
  /** 展示用 emoji（可选） */
  emoji?: string
}

/** 工具注册项：元信息 + 实现 */
export interface AgentToolRegistration {
  meta: AgentToolMeta
  tool: IAgentTool
}

// ══════════════════════════════════════════════════════════════
// MCP 类型（MCP 服务器配置/状态/工具定义）
// ══════════════════════════════════════════════════════════════

/** MCP 传输类型 */
export type McpTransportType = 'stdio' | 'http'

/** MCP 服务器配置 */
export interface McpServerConfig {
  /** 服务器名（唯一） */
  name: string
  /** 传输类型：stdio（子进程）或 http（远程） */
  transport: McpTransportType
  /** stdio 模式：启动命令 */
  command?: string
  /** stdio 模式：命令参数 */
  args?: string[]
  /** http 模式：服务器 URL */
  url?: string
  /** 是否启用 */
  enabled: boolean
}

/** MCP 服务器状态（连接 + 发现的工具） */
export interface McpServerState {
  name: string
  transport: McpTransportType
  command?: string
  args?: string[]
  url?: string
  enabled: boolean
  /** 是否已连接 */
  connected: boolean
  /** 最近检测时间 */
  lastCheck: string | null
  /** 连接错误信息（连接失败时） */
  error?: string
  /** 发现的工具列表 */
  tools: McpDiscoveredTool[]
}

/** MCP 发现的工具（服务器返回的原始定义） */
export interface McpDiscoveredTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** MCP 工具完整定义（注册用） */
export interface McpToolDefinition {
  id: string
  name: string
  description: string
  inputSchema: Record<string, unknown>
  serverName: string
}

/** JSON-RPC 请求 */
export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: Record<string, unknown>
}

/** JSON-RPC 响应 */
export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

/** MCP 调用结果 */
export interface McpCallResult {
  content: Array<{ type: string; text?: string }>
  isError?: boolean
}

/** 检测过的工具（内置检测结果，本地版恒为空） */
export interface CheckedTool {
  id: string
  name: string
  description: string
  category: string
  source: 'builtin'
  available: boolean
  reason?: string
  schema: unknown
}

/** 统一工具定义（用于 register_tools 上报服务端） */
export interface RegisteredTool {
  id: string
  name: string
  description: string
  category: string
  available: boolean
  schema: unknown
  /** MCP 工具的服务器配置名（仅 MCP 来源有效） */
  serverName?: string
}

/** ToolCenter 状态快照（主进程→渲染进程，设置页用） */
export interface ToolCenterState {
  /** 内建工具（本地版已移除，恒为空） */
  builtin: CheckedTool[]
  /** MCP 服务器状态列表 */
  mcpServers: McpServerState[]
  updatedAt: string
}

/** 客户端环境信息（collect-env 返回） */
export interface ClientEnvInfo {
  os: string
  arch: string
  clientType: string
  shell: string
  homeDir: string
  pathFormat: string
}
