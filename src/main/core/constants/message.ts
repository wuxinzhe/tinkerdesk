/**
 * constants/message.ts — 消息类型 / 完成原因 / 交互状态常量
 * 消息类型常量。
 */
/** 消息类型 */
export const MSG_TYPE_USER = 'user_normal'
export const MSG_TYPE_USER_CONTINUE = 'user_continue'
export const MSG_TYPE_ASSISTANT_TEXT = 'assistant_text'
export const MSG_TYPE_ASSISTANT_TOOL_CALL = 'assistant_tool_call'
export const MSG_TYPE_ASSISTANT_HYBRID = 'assistant_hybrid'
export const MSG_TYPE_ASSISTANT_THINKING = 'assistant_thinking'
export const MSG_TYPE_TOOL_RESULT = 'tool_result'
export const MSG_TYPE_APPROVAL_REQUEST = 'approval_request'
export const MSG_TYPE_CLARIFY_REQUEST = 'clarify_request'
export const MSG_TYPE_SYSTEM_SUMMARY = 'system_summary'

/** 完成原因 */
export const FINISH_COMPLETE = 'complete'
export const FINISH_LENGTH = 'length'

/** 交互状态 */
export const STATUS_PENDING = 'pending'
export const STATUS_APPROVED = 'approved'
export const STATUS_REJECTED = 'rejected'
export const STATUS_TIMED_OUT = 'timed_out'

/** 展示给用户的消息类型 */
export const MSG_TYPE_DISPLAY_SET = new Set<string>([
  MSG_TYPE_USER, MSG_TYPE_ASSISTANT_TEXT, MSG_TYPE_ASSISTANT_HYBRID,
  MSG_TYPE_ASSISTANT_TOOL_CALL, MSG_TYPE_APPROVAL_REQUEST, MSG_TYPE_CLARIFY_REQUEST,
])

/** 发送给 LLM 的消息类型 */
export const MSG_TYPE_LLM_CONTEXT_SET = new Set<string>([
  MSG_TYPE_USER, MSG_TYPE_USER_CONTINUE,
  MSG_TYPE_ASSISTANT_TEXT, MSG_TYPE_ASSISTANT_TOOL_CALL, MSG_TYPE_ASSISTANT_HYBRID,
  MSG_TYPE_ASSISTANT_THINKING, MSG_TYPE_TOOL_RESULT,
])
