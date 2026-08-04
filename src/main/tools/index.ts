/**
 * tools/index.ts — Agent 工具系统统一出口
 *
 * 复刻 showing-agent core/tools 包（TS 本地版）。
 */
// 类
export {ToolManager, parseToolName} from './tool-manager'
export {ToolSchema} from './tool-schema'
export {ToolResult} from './tool-result'

// 类型
export type {
  ToolFunction,
  AgentToolMeta,
  AgentToolRegistration,
  IAgentTool,
  ToolExecutionContext,
} from './types'
