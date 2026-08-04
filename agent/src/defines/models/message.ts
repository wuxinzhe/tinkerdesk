/** 消息数据模型 */
export interface Message {
  /** 主键 — 服务端返回 long(number)，客户端本地消息为 string */
  id: string | number
  sessionId: string
  conversationId?: string
  /** 角色 — 'clarify' 为客户端 enrich，服务端不返回 */
  role: 'user' | 'assistant' | 'system' | 'approval' | 'clarify'
  messageType?: string
  content: string
  reasoningContent?: string
  /** 时间戳（epoch ms） */
  timestamp: number
  /** 工具调用信息 — 服务端返回 JSON string，客户端 parse 为 ToolCall */
  toolCall?: ToolCall | string
  /** 状态 — 客户端本地消息用 'sending'/'sent'，服务端返回 finishReason 字符串 */
  status: string
  toolName?: string
  toolCallId?: string
  approvalArguments?: unknown
  // 服务端返回（MessageVO）
  interactionStatus?: 'pending' | 'approved' | 'rejected' | 'timed_out'
  // 服务端返回（ConversationMessageVO 独有）
  finishReason?: string
  // 客户端 enrich（normalizeMessages / chat-store 填充）
  clarifyQuestion?: string
  clarifyChoices?: string[] | null
  /** 是否为流式消息（客户端本地标记，服务端不返回） */
  isStreaming?: boolean
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  result?: unknown
  error?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  toolMultiCall?: Record<string, { name: string; arguments?: Record<string, unknown>; status?: string }>
}

export interface ApprovalRequest {
  toolCallId: string
  sessionId: string
  name: string
  arguments: Record<string, unknown>
  reason?: string
}
