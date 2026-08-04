/**
 * types.ts — Agent 工具系统统一类型定义
 *
 * 只放类型定义（接口/类型别名），类实现独立成文件：
 * - ToolSchema → tool-schema.ts
 * - ToolResult → tool-result.ts
 */
import type {ToolCall} from '../../defines/models/message'
import type {ToolSchema} from './tool-schema'
import type {ToolResult} from './tool-result'

// ── ToolFunction（对应 Java ToolFunction） ─────────────────────────

/** OpenAI function-calling 格式中的 function 对象 */
export interface ToolFunction {
  /** 工具名称 */
  name: string
  /** 工具功能描述 */
  description: string
  /** 参数 JSON Schema 对象 */
  parameters: Record<string, unknown> | null
}

// ── ToolCall（对应 Java ToolCall，复用项目已有定义） ────────────────

export type {ToolCall}

// ── 工具执行上下文 ────────────────────────────────────────────────

/** 工具执行上下文（对齐 loop 的 ToolContext 核心字段） */
export interface ToolExecutionContext {
  sessionId: string
  conversationId: string
  profile: string
  connectId: string
  yolo: boolean
  /** 原始工具调用 */
  toolCall: ToolCall
  /** 发送动作事件给客户端 */
  sendAction: (eventType: string, payload: Record<string, unknown>) => void
  /** 发送消息给客户端 */
  sendMessage: (eventType: string, payload: unknown) => void
}

// ── IAgentTool（对应 Java IAgentTool） ─────────────────────────────

/** Agent 工具 SPI 接口（所有工具需实现） */
export interface IAgentTool {
  /** 获取工具的 Schema 定义（用于向 LLM 描述工具） */
  getSchema(): ToolSchema
  /** 执行工具调用，返回字符串结果（将直接发送给 LLM） */
  execute(ctx: ToolExecutionContext): Promise<ToolResult>
}

// ── 工具注册元信息（对应 Java @AgentTool 注解） ────────────────────

/** 工具元信息 */
export interface AgentToolMeta {
  /** 工具名（全局唯一，不区分大小写） */
  name: string
  /** 展示用 emoji（可选） */
  emoji?: string
}

/** 工具注册项：元信息 + 实现 */
export interface AgentToolRegistration {
  meta: AgentToolMeta
  tool: IAgentTool
}
