/**
 * constants/event.ts — Agent 事件名常量
 * 对齐 showing-agent EventConstants（小写连字符风格；sendAction/sendTips 的 type）。
 */
export const EVT_TOOLS_REGISTERED = 'tools_registered'
export const EVT_SESSION_CREATED = 'session_created'
export const EVT_PONG = 'pong'
export const EVT_MESSAGE_QUEUED = 'message_queued'
export const EVT_CONVERSATION_INTERRUPTED = 'conversation_interrupted'
export const EVT_STATUS = 'status'
export const EVT_AGENT_RESPONSE = 'agent_response'
export const EVT_AGENT_RESPONSE_TOKEN = 'agent_response_token'
export const EVT_AGENT_REASONING_TOKEN = 'agent_reasoning_token'
export const EVT_AGENT_TOOL_CALL_TOKEN = 'agent_tool_call_token'
export const EVT_AGENT_REASONING = 'agent_reasoning'
export const EVT_TOOL_PROGRESS = 'tool_progress'
export const EVT_TOOL_START = 'tool_start'
export const EVT_TOOL_DONE = 'tool_done'
export const EVT_EXE_CLIENT_TOOL = 'exe_client_tool'
export const EVT_EXE_MCP_TOOL = 'exe_mcp_tool'
export const EVT_APPROVAL_REQUEST = 'approval_request'
export const EVT_CLARIFY_REQUEST = 'clarify_request'
export const EVT_INTERACTION_STATUS_UPDATE = 'interaction_status_update'
export const EVT_CLARIFY_STATUS_UPDATE = 'clarify_status_update'
export const EVT_SESSION_TITLE_UPDATED = 'session_title_updated'
export const EVT_CONVERSATION_COMPLETE = 'conversation_complete'
export const EVT_USER_MESSAGE = 'user_message'
export const EVT_STOP = 'stop'
export const EVT_REVOKE = 'revoke'
export const EVT_REGISTER_TOOLS = 'register_tools'
export const EVT_TOOL_RESULT = 'tool_result'
export const EVT_APPROVAL_RESPONSE = 'approval_response'
export const EVT_PING = 'ping'
export const EVT_CLIENT_REGISTER = 'client_register'

/** 动作通道事件名（本地特有：token 预算） */
export const EVT_BUDGET_UPDATE = 'budget_update'

/** Agent 事件 action 联合类型（sendAction 第二参数类型约束） */
export type AgentActionType =
  | typeof EVT_TOOL_START
  | typeof EVT_TOOL_DONE
  | typeof EVT_SESSION_TITLE_UPDATED
  | typeof EVT_INTERACTION_STATUS_UPDATE
  | typeof EVT_MESSAGE_QUEUED
  | typeof EVT_BUDGET_UPDATE
