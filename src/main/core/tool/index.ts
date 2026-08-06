/**
 * tool/index.ts — 工具核心功能模块统一出口
 *
 * core/tool = 工具注册、调用、管理（核心功能模块）：
 * - ToolManager：统一注册中心（注册/查询/路由/禁用管理）
 * - ToolSchema / ToolResult：工具 Schema / 结果类
 * - MCP：McpToolCenter（MCP 注册中心）+ McpManager（MCP 执行器）+ McpTool（MCP 工具实例）
 *
 * 具体工具实现（内建/桌面）在 main/tools。
 */
// ── 工具核心 ──
export { ToolManager } from './tool-manager'
export { ToolSchema } from './tool-schema'
export { ToolResult } from './tool-result'
export { TOOL_TYPE_BUILTIN, TOOL_TYPE_CLIENT, TOOL_TYPE_MCP } from './types'
export type {
  AgentToolMeta,
  AgentToolRegistration,
  IAgentTool,
  ToolFunction,
  ToolType,
  ToolCall,
} from './types'

// ── MCP ──
export { McpToolCenter } from './mcp-tool-center'
export { McpTool } from './mcp-tool'
export { mcpManager, McpManager } from './mcp-manager'
export { HttpTransport, PROTOCOL_VERSION } from './mcp-http-transport'
export { StdioTransport } from './mcp-stdio-transport'

// ── 单例工厂 ──
export { getMcpToolCenter } from './mcp-tool-center'

export type {
  McpServerConfig,
  McpServerState,
  McpDiscoveredTool,
  McpToolDefinition,
  McpCallResult,
  JsonRpcRequest,
  JsonRpcResponse,
  CheckedTool,
  RegisteredTool,
  ToolCenterState,
  ClientEnvInfo,
} from './types'
