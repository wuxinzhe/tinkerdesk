/**
 * constants.ts — AgentLoop 状态值统一常量
 *
 * 统一引用（避免裸字符串失配，如 ChatOperation 曾用 'text' 与 RES_TEXT 常量不匹配）：
 * - Agent 事件 action（sendAction/sendTips 的 type）
 * - 消息角色 / 交互状态 / 审批拒绝文案
 * 消息类型用 message-service 的 MSG_TYPE_*；对话状态用 loop/types 的 CONV_*。
 */

/** Agent 事件 action（sendAction/sendTips 的 type） */
export const EVT_BUDGET_UPDATE = 'BUDGET_UPDATE'
export const EVT_TOOL_START = 'TOOL_START'
export const EVT_TOOL_DONE = 'TOOL_DONE'
export const EVT_SESSION_TITLE_UPDATED = 'SESSION_TITLE_UPDATED'
export const EVT_INTERACTION_STATUS_UPDATE = 'INTERACTION_STATUS_UPDATE'
export const EVT_MESSAGE_QUEUED = 'MESSAGE_QUEUED'

/** Agent 事件 action 联合类型（sendAction 第二参数类型约束） */
export type AgentActionType =
  | typeof EVT_BUDGET_UPDATE
  | typeof EVT_TOOL_START
  | typeof EVT_TOOL_DONE
  | typeof EVT_SESSION_TITLE_UPDATED
  | typeof EVT_INTERACTION_STATUS_UPDATE
  | typeof EVT_MESSAGE_QUEUED

/** 消息角色 */
export const ROLE_SYSTEM = 'system'
export const ROLE_USER = 'user'
export const ROLE_ASSISTANT = 'assistant'
export const ROLE_TOOL = 'tool'
export const ROLE_APPROVAL = 'approval'

/** 交互状态（对齐 showing-agent MessageConstants：STATUS_PENDING/APPROVED/REJECTED/TIMED_OUT） */
export const STATUS_PENDING = 'pending'
export const STATUS_APPROVED = 'approved'
export const STATUS_REJECTED = 'rejected'
export const STATUS_TIMED_OUT = 'timed_out'

/** 审批拒绝返回文案（工具执行中止原因） */
export const APPROVAL_REJECTED_MSG = '用户拒绝执行'
