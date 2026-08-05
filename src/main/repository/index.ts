/**
 * repository/index.ts — 数据访问层统一出口
 *
 * 对应 showing-agent repository 包（MyBatis Mapper → TS Repository 类）。
 * 全部表结构在 database.ts 的 createTables 中定义。
 */
export {initDatabase, getDatabase, closeDatabase} from './database'
export {MessageRepository} from './message-repository'
export {ConversationRepository} from './conversation-repository'
export {SessionRepository} from './session-repository'
export {AgentRepository} from './agent-repository'
export {AgentConfigRepository} from './agent-config-repository'
export {CustomModelRepository} from './custom-model-repository'
export {SystemProviderRepository} from './system-provider-repository'
export {SkillCategoryRepository} from './skill-category-repository'
export {PrivateSkillRepository} from './private-skill-repository'
export {PrivateSkillFileRepository} from './private-skill-file-repository'
export {PrivateSkillRelatedRepository} from './private-skill-related-repository'
export {UserDisabledToolRepository} from './user-disabled-tool-repository'
export {UserPathWhitelistRepository} from './user-path-whitelist-repository'
export {UserUrlWhitelistRepository} from './user-url-whitelist-repository'
export {PromptModuleRepository} from './prompt-module-repository'
export {UserSceneModelRepository} from './user-scene-model-repository'
export {ProviderRepository} from './providers-repository'

export type {MessageEntity, MessageQuery, SessionMessageQuery} from './types'
export type {ConversationEntity, ConversationStatusUpdate} from './types'
export type {SessionEntity, SessionSummaryDTO} from './types'
export type {AgentEntity, AgentModeInfoDTO} from './types'
export type {AgentConfigEntity} from './types'
export type {
  CustomModelEntity, CreateCustomModelInput, UpdateCustomModelInput,
  CustomModelRow, ProviderEntity, ProviderRow,
} from './types'
export type {SystemProviderEntity} from './types'
export type {SkillCategoryEntity} from './types'
export type {PrivateSkillEntity, FilteredSkillDTO} from './types'
export type {SkillFileEntity} from './types'
export type {SkillRelatedEntity} from './types'
export type {UserPathWhitelistEntity} from './types'
export type {UserUrlWhitelistEntity} from './types'
export type {UserPromptModuleEntity} from './types'
export type {UserSceneModelEntity, SceneModelBinding} from './types'
