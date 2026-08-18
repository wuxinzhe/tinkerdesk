/**
 * tool/index.ts — 工具核心功能模块统一出口
 *
 * core/tool = 工具注册、调用、管理（核心功能模块）：
 * - ToolManager：统一注册中心（注册/查询/路由/禁用管理）
 * - ToolCenter：外置工具包中心（安装/加载/卸载/可用性）
 * - ToolSchema / ToolResult：工具 Schema / 结果类
 *
 * 具体工具实现（内建/桌面）在 main/tools。
 */
// ── 工具核心 ──
export { ToolManager } from './tool-manager'
export { ToolSchema } from './tool-schema'
export { ToolResult } from './tool-result'
export { TOOL_TYPE_BUILTIN, TOOL_TYPE_CLIENT } from './types'
export type {
  AgentToolMeta,
  AgentToolRegistration,
  IAgentTool,
  ToolFunction,
  ToolType,
  ToolCall,
} from './types'