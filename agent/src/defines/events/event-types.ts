/** 事件类型常量 —— 对应服务端 EventConstants */

/** STOMP 连接路径 */
export const WS_URL_PATH = '/ws/stomp'

/** C→S（客户端→服务端）消息类型 */
export const CS_EVENTS = {
  USER_MESSAGE: 'user_message',
  TOOL_RESULT: 'tool_result',
  REGISTER_TOOLS: 'register_tools',
  APPROVAL_RESPONSE: 'approval_response',
  STOP: 'stop',
  REVOKE: 'revoke',
  PING: 'ping',
  EXTENSION_EXECUTE: 'extension_execute',
  EXTENSION_EVENT: 'extension_event',
} as const

/** S→C（服务端→客户端）事件类型 */
export const SC_EVENTS = {
  // chat 通道
  AGENT_RESPONSE: 'agent_response',
  AGENT_RESPONSE_TOKEN: 'agent_response_token',
  MESSAGE_QUEUED: 'message_queued',
  CONVERSATION_COMPLETE: 'conversation_complete',
  CONVERSATION_INTERRUPTED: 'conversation_interrupted',
  SESSION_TITLE_UPDATED: 'session_title_updated',

  // action 通道
  EXECUTE_TOOL: 'exe_client_tool',
  TOOL_PROGRESS: 'tool_progress',
  APPROVAL_REQUEST: 'approval_request',
  APPROVAL_STATUS_UPDATE: 'interaction_status_update',
  CLARIFY_STATUS_UPDATE: 'clarify_status_update',
  SESSION_CREATED: 'session_created',
  TOOLS_REGISTERED: 'tools_registered',
  PONG: 'pong',

  // thinking 通道
  AGENT_REASONING: 'agent_reasoning',
} as const

/** S→C 5 个路由类别 */
export const SC_ROUTES = {
  CHAT: 'chat',
  ACTION: 'action',
  ERROR: 'error',
  TIPS: 'tips',
  THINKING: 'thinking',
} as const

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
  /** 是否为流的最后一个信号 */
  isFinish: boolean
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

/** action 通道 — conversation_complete / 无 data 事件 */
export interface ActionSignalPayload {
  sessionId: string
  type: string
  data?: unknown
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
