/**
 * agent-api-types.ts — Agent 会话统一契约（本地/远端同源）
 *
 * 本地 AgentLoop（Electron 主进程）与远端 showing-agent 服务端
 * 使用同一套数据结构（MessageVO / AgentRequest），渲染层无需感知来源。
 *
 * 对应 showing-agent MessageVO / AgentRequest / IConversationEngine 的核心接口。
 */

/** 消息角色（对齐 showing-agent） */
export type AgentMessageRole = 'user' | 'assistant' | 'system' | 'tool'

/** 交互状态（对齐 showing-agent MessageConstants） */
export type InteractionStatus = 'pending' | 'approved' | 'rejected' | 'timed_out' | ''

/** 消息类型（对齐 showing-agent MessageConstants） */
export type AgentMessageType =
  | 'user_message'
  | 'assistant_text'
  | 'assistant_tool_call'
  | 'assistant_thinking'
  | 'tool_result'
  | 'approval_request'
  | 'clarify_request'
  | 'summary'

/** MessageVO — 渲染层统一消息结构（本地/远端同源） */
export interface AgentMessageVO {
  /** 消息 ID（本地=自增 id，远端=服务端 id） */
  id?: number | string
  sessionId: string
  conversationId: string
  /** 角色 */
  role: AgentMessageRole
  /** 文本内容 */
  content: string
  /** 推理内容（DeepSeek/Claude thinking） */
  reasoningContent?: string
  /** 工具调用（JSON 字符串或对象，同源透传） */
  toolCall?: string | Record<string, {name: string; arguments?: unknown}>
  toolCallId?: string
  toolName?: string
  finishReason?: string
  interactionStatus?: InteractionStatus
  messageType?: AgentMessageType
  /** token 预算（随 agent_response 下发） */
  budget?: {remainingTokens: number; contextLimit: number}
  /** 是否流式（前端标记） */
  isStreaming?: boolean
  createdAt?: string
  updatedAt?: string
}

/** 流式 token 事件（本地/远端同源，对应 LlmChunk） */
export interface AgentStreamEvent {
  /** 文本增量 */
  text?: string
  /** 推理增量 */
  reasoning?: string
  /** 工具参数增量 */
  toolCallArgs?: string
  /** 是否结束 */
  isFinish: boolean
  finishReason?: string
}

/** 发送消息请求（渲染层 → Agent 层） */
export interface AgentSendRequest {
  sessionId?: string
  content: string
}

/** 工具结果回调请求（对齐 onToolResult） */
export interface AgentToolResultRequest {
  sessionId: string
  toolCallId: string
  result: string
}

/** 审批响应请求（对齐 onApprovalResponse） */
export interface AgentApprovalRequest {
  sessionId: string
  toolCallId: string
  approved: boolean
}

/** 审批请求事件（主进程 → 渲染层，弹审批卡片） */
export interface AgentApprovalEvent {
  toolCallId: string
  name: string
  arguments?: unknown
  reason?: string
}

/** Agent 会话 API — 统一接口（local/remote 两套实现） */
export interface AgentApi {
  /** 发送消息（onUserMessage），流式通过回调返回 */
  chat(req: AgentSendRequest, onToken?: (evt: AgentStreamEvent) => void): Promise<AgentMessageVO>
  /** 工具结果回调（UI/扩展工具异步返回） */
  toolResult(req: AgentToolResultRequest): Promise<{ok: boolean}>
  /** 审批响应（用户同意/拒绝） */
  approval(req: AgentApprovalRequest): Promise<{ok: boolean}>
  /** 撤回消息 */
  revoke(sessionId: string, messageId: string): Promise<{ok: boolean}>
  /** 中断对话（stop） */
  interrupt(sessionId: string): Promise<{ok: boolean}>
  /** 清理会话状态 */
  clearAll(sessionId: string): Promise<{ok: boolean}>
  /** 监听审批请求事件（渲染层弹审批卡片） */
  onApprovalRequest(cb: (payload: AgentApprovalEvent) => void): () => void
  /** 监听消息事件（远端推送 / 本地广播） */
  onMessage?(cb: (msg: AgentMessageVO) => void): void
  /** 监听生命周期事件 */
  onEvent?(cb: (event: {type: string; payload?: unknown}) => void): void
}

/** 通信模式 */
export type AgentTransportMode = 'local' | 'remote'
