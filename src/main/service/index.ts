/**
 * service/index.ts — 服务层统一出口
 *
 * 三层结构：repository（repository/）→ service（本层）→ 上层（AgentLoop/controller）
 * 本地业务无 controller，服务直接接入 AgentLoop。
 */
export type { ConversationEntity, ConversationStatusUpdate, MessageEntity, SessionEntity, SessionSummaryDTO } from '../repository/types'
export { CompactionService } from './compaction-service'
export { CompressionCooldownStore } from './compression-cooldown-store'
export { ConversationService } from './conversation-service'
export { MemoryStore } from './memory-store'
export { entityToApiMessage, MessageFactory, MessageService, MSG_TYPE_APPROVAL_REQUEST, MSG_TYPE_ASSISTANT_HYBRID, MSG_TYPE_ASSISTANT_TEXT, MSG_TYPE_ASSISTANT_THINKING, MSG_TYPE_ASSISTANT_TOOL_CALL, MSG_TYPE_CLARIFY_REQUEST, MSG_TYPE_SYSTEM_SUMMARY, MSG_TYPE_TOOL_RESULT, MSG_TYPE_USER, MSG_TYPE_USER_CONTINUE } from './message-service'
export { SessionService } from './session-service'
export { TodoService } from './todo-service'
export type { CooldownEntry, MemoryOperation, TodoItem } from './types'
export type { TodoListResponse, TodoSummary, DiscoverHitDTO, ReadResultDTO, ScrollResultDTO, SkillSummaryDTO, SkillDetailDTO } from './types'

// ── 技能/供应商/白名单/场景模型/禁用工具 服务层 ──
export type { FilteredSkillDTO, PrivateSkillEntity, SceneModelBinding, SkillCategoryEntity, SkillFileEntity, SkillRelatedEntity, SystemProviderEntity, UserPathWhitelistEntity, UserPromptModuleEntity, UserSceneModelEntity, UserUrlWhitelistEntity } from '../repository/types'
export { PrivateSkillService } from './private-skill-service'
export { PromptService } from './prompt-service'
export { SandboxWhitelistService } from './sandbox-whitelist-service'
export { ToolAuthService } from './tool-auth-service'
export { MessageQueueStore, type UserMessageQueueItem } from './message-queue-store'
export {
  ToolLoopGuardrail,
  GuardrailAction,
  classifyToolFailure,
  appendGuardrailGuidance,
  syntheticGuardrailResult,
} from './tool-loop-guardrail-service'
export { SceneModelService } from './scene-model-service'
export { ModelConfigService } from './model-config-service'
export { SessionContextFactory } from './session-context-factory'
export { AgentModeService } from './agent-mode-service'
export { DefaultAgentMode } from './agent/default-agent-mode'
export { SkillCategoryService } from './skill-category-service'
export { SystemProviderService } from './system-provider-service'
export { UserDisabledToolService } from './user-disabled-tool-service'
export { UserCustomModelService, toCustomModelInfoDTO } from './user-custom-model-service'
export { AgentService, toAgentInfoDTO } from './agent-service'
export { AgentConfigService } from './agent-config-service'

