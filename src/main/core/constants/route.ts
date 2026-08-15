/**
 * constants/route.ts — 推送事件路由常量（单字段两级：{一级}:{二级}）
 *
 * 协议见 docs/archive/event-protocol.md：
 * 一级 = 业务域（chat/session/action/tip/error）；二级 = 域内事件 type。
 * 完整 route = ROUTE + ':' + type——客户端 split(':') 解析。
 */

// ── 一级路由（业务域） ──
/** 对话内容流：token/审批/澄清/卡片状态 */
export const ROUTE_CHAT = 'chat'
/** 会话数据/状态：stats/complete/title/budget */
export const ROUTE_SESSION = 'session'
/** 行为动作（兜底）：tool_start/tool_done */
export const ROUTE_ACTION = 'action'
/** 提示信息：queued/working */
export const ROUTE_TIP = 'tip'
/** 报错 */
export const ROUTE_ERROR = 'error'

// ── 二级 type：chat 域 ──
/** 流式 token（data = StreamToken：text/reasoning/toolCallArgs/isFinish） */
export const EVT_CHAT_TOKEN = 'token'
/** 审批请求卡片（data = {toolCallId, name, arguments, reason, conversationId}） */
export const EVT_CHAT_APPROVAL = 'approval'
/** 澄清卡片（data = {toolCallId, name, arguments}） */
export const EVT_CHAT_CLARIFY = 'clarify'
/** 审批/工具卡片状态（data = {toolCallId, interactionStatus, content, messageType}——超时由 main 控制） */
export const EVT_CHAT_INTERACTION_STATUS = 'interaction_status'

// ── 二级 type：session 域 ──
/** 会话统计（data = statsData：model/promptTokens/hitRate/contextLimit...） */
export const EVT_SESSION_STATS = 'stats'
/** 对话完成（data = statsData——与 stats 同数据） */
export const EVT_SESSION_COMPLETE = 'complete'
/** 会话标题（data = {title}） */
export const EVT_SESSION_TITLE = 'title'
/** 上下文预算（data = {remainingTokens, contextLimit}） */
export const EVT_SESSION_BUDGET = 'budget'

// ── 二级 type：action 域 ──
/** 工具开始（data = {toolName}） */
export const EVT_ACTION_TOOL_START = 'tool_start'
/** 工具完成（data = {toolCallId, toolName, success}） */
export const EVT_ACTION_TOOL_DONE = 'tool_done'

/** action 域事件 type 联合（sendAction 第二参数类型约束） */
export type AgentActionType =
  | typeof EVT_ACTION_TOOL_START
  | typeof EVT_ACTION_TOOL_DONE

// ── 二级 type：tip 域 ──
/** 消息入队/对话中断 */
export const EVT_TIP_QUEUED = 'queued'
/** 长任务提示（⏳ Working） */
export const EVT_TIP_WORKING = 'working'

// ── 二级 type：error 域 ──
/** 通用 Agent 错误（对话处理异常/连续空响应/CYCLE_ERROR） */
export const EVT_ERROR_AGENT = 'agent_error'
