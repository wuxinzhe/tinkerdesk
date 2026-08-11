/**
 * stores/types.ts — 对话事件类型定义
 *
 * chat-store 处理的事件 payload 类型（原 event-types.ts，已删 STOMP 常量）。
 */

// ══════════════════════════════════════════════
// S→C 事件信封（对应服务端 EventEnvelope）
// ══════════════════════════════════════════════

/** 路由类别 */
export type RouteType = 'chat' | 'action' | 'thinking' | 'error' | 'tips'

/** 原始 EventEnvelope（STOMP 消息体） */
export interface EventEnvelope {
  event: RouteType
  sessionId: string
  conversationId?: string
  payload: ChatPayload | ActionPayload | SignalPayload
}

// ══════════════════════════════════════════════
// 服务端 Payload 结构（对应 Java 的 MessagePayload / EventPayload / SignalPayload）
// ══════════════════════════════════════════════

/** chat 路由：MessagePayload { type, data: MessageVO } */
export interface ChatPayload {
  type: string
  data: Record<string, unknown>
}

/** action 路由：EventPayload { type, data } */
export interface ActionPayload {
  type: string
  data: unknown
}

/** thinking / error / tips 路由：SignalPayload { type, message } */
export interface SignalPayload {
  type: string
  message: string
}

// ══════════════════════════════════════════════
// chat-store.ts 合并后的事件负载（payload + envelope.sessionId 合并后的扁平结构）
// ══════════════════════════════════════════════

/**
 * chat-store.setBackend() 中把 payload spread + sessionId/conversationId 从
 * envelope 顶层合并，得到的事件负载类型（按 event 区分）。
 */

/** chat 通道 — agent_response 子事件 */
export interface AgentResponsePayload {
  sessionId: string
  conversationId?: string
  type: string // 'agent_response'
  data?: {
    content?: string
    conversationId?: string
    messageType?: string
  }
}

/** 流式 token 载荷（对应后端 MessageTokenVO） */
export interface MessageTokenVO {
  sessionId: string
  conversationId: string
  /** 文本内容增量（delta.content），无文本时 null */
  token: string | null
  /** 推理内容增量（delta.reasoning_content），无推理时 null */
  reasoning: string | null
  /** 工具调用参数增量（delta.tool_calls），无工具调用时 null */
  toolCallArgs: string | null
  /** 工具名（工具调用增量首次出现时携带） */
  toolCallName?: string
  /** 工具调用 index（多工具时区分——前端按 index 分路拼装） */
  toolCallIndex?: number
  /** 是否为流的最后一个信号 */
  isFinish: boolean
  /** 结束原因（isFinish=true 时由后端设置；'tool_calls' = 工具轮次） */
  finishReason?: string
  /** 时间戳（isFinish=true 时由后端设置） */
  timestamp: number
}

/** chat 通道 — agent_response_token 子事件 */
export interface AgentResponseTokenPayload {
  sessionId: string
  conversationId: string
  type: string // 'agent_response_token'
  data: MessageTokenVO
}

/** chat 通道 — approval_request / interaction_status_update 子事件 */
export interface ApprovalRequestPayload {
  sessionId: string
  conversationId?: string
  type: string
  data?: MessageVOData
}

/** chat 通道 — clarify_request 子事件（数据在 data.toolCall JSON 中） */
export interface ClarifyRequestPayload {
  sessionId: string
  type: string
  data?: MessageVOData
}

/** chat 通道 — clarify_status_update 子事件 */
export interface ClarifyStatusPayload {
  sessionId: string
  type: string
  data?: {
    toolCallId?: string
    interactionStatus?: string
  }
}

/** MessageVO 字段（用于 approval_request data） */
export interface MessageVOData {
  id?: string
  sessionId?: string
  conversationId?: string
  role?: string
  content?: string
  timestamp?: number
  toolCall?: string
  toolName?: string
  status?: string
  reasoningContent?: string
  interactionStatus?: string
  messageType?: string
  toolCallId?: string
  approvalArguments?: unknown
}

/** thinking 通道 */
export interface ThinkingPayload {
  sessionId: string
  type: string
  message: string
}

/** action 通道 — exe_client_tool 子事件 */
export interface ExecuteToolPayload {
  sessionId: string
  type: string // 'exe_client_tool'
  data?: {
    id?: string
    name?: string
    arguments?: Record<string, unknown>
  }
}

/** action 通道 — session_title_updated 子事件 */
export interface SessionTitleUpdatedPayload {
  sessionId: string
  type: string
  data?: {
    title?: string
  }
}

/** action 通道 — conversation_complete / 无 data 事件（convId 可选——多会话并发区分对话） */
export interface ActionSignalPayload {
  sessionId: string
  type: string
  data?: unknown
  convId?: string
}

/** error 通道 */
export interface ErrorPayload {
  sessionId?: string
  type: string
  message: string
}

/** tips 通道 */
export interface TipsPayload {
  sessionId?: string
  type: string
  message: string
}

// ══════════════════════════════════════════════
// chat-store handler 函数签名用的联合类型
// ══════════════════════════════════════════════

/** handleChatEvent 的 payload 联合 */
export type ChatMergedPayload =
  | AgentResponsePayload
  | AgentResponseTokenPayload
  | ApprovalRequestPayload
  | ClarifyRequestPayload
  | ClarifyStatusPayload

/** handleActionEvent 的 payload 联合 */
export type ActionMergedPayload =
  | ExecuteToolPayload
  | SessionTitleUpdatedPayload
  | ActionSignalPayload
