/**
 * service/index.ts — 服务层统一出口
 *
 * 三层结构：repository（db/）→ service（本层）→ 上层（AgentLoop）
 * 本地业务无 controller，服务直接接入 AgentLoop。
 */
export {MessageService, MessageFactory, entityToApiMessage} from './message-service'
export type {MessageEntity} from '../db/message-repository'
export {
  MSG_TYPE_USER,
  MSG_TYPE_ASSISTANT_TEXT,
  MSG_TYPE_ASSISTANT_TOOL_CALL,
  MSG_TYPE_ASSISTANT_THINKING,
  MSG_TYPE_TOOL_RESULT,
  MSG_TYPE_APPROVAL_REQUEST,
  MSG_TYPE_SUMMARY,
} from './message-service'
export {ConversationService} from './conversation-service'
export type {ConversationEntity, ConversationStatusUpdate} from '../db/conversation-repository'
export {SessionService} from './session-service'
export type {SessionEntity, SessionSummaryDTO} from '../db/session-repository'
