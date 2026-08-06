/**
 * constants/message.ts — 消息类型 / 完成原因 / 交互状态常量
 * 对齐 showing-agent MessageConstants。
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

/** 交互结果内容文本（对齐 Java STATUS_CONTENT_*） */
export const STATUS_CONTENT_APPROVED = '✅ 已批准'
export const STATUS_CONTENT_REJECTED = '❌ 已拒绝'
export const STATUS_CONTENT_TIMED_OUT = '⏰ 已过期'
