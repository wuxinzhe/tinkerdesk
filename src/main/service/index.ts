/**
 * service/index.ts — 服务层统一出口
 *
 * 三层结构：repository（repository/）→ service（本层）→ 上层（AgentLoop/controller）
 * 本地业务无 controller，服务直接接入 AgentLoop。
 */
export {MessageService, MessageFactory, entityToApiMessage} from './message-service'
export type {MessageEntity} from '../repository/types'
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
export type {ConversationEntity, ConversationStatusUpdate} from '../repository/types'
export {SessionService} from './session-service'
export type {SessionEntity, SessionSummaryDTO} from '../repository/types'
export {CompactionService} from './compaction-service'
export {CompressionCooldownStore} from './compression-cooldown-store'
export {MemoryStore} from './memory-store'
export type {MemoryOperation} from './memory-store'
export {TodoService} from './todo-service'
export type {TodoItem} from './todo-service'

// ── 技能/供应商/白名单/场景模型/禁用工具 服务层 ──
export {PrivateSkillService} from './private-skill-service'
export type {PrivateSkillEntity, FilteredSkillDTO, SkillFileEntity, SkillRelatedEntity} from '../repository/types'
export {SkillCategoryService} from './skill-category-service'
export type {SkillCategoryEntity} from '../repository/types'
export {SystemProviderService} from './system-provider-service'
export type {SystemProviderEntity} from '../repository/types'
export {PromptService} from './prompt-service'
export type {UserPromptModuleEntity} from '../repository/types'
export {SceneModelService} from './scene-model-service'
export type {SceneModelBinding, UserSceneModelEntity} from '../repository/types'
export {SandboxWhitelistService} from './sandbox-whitelist-service'
export type {UserUrlWhitelistEntity, UserPathWhitelistEntity} from '../repository/types'
export {UserDisabledToolService} from './user-disabled-tool-service'
