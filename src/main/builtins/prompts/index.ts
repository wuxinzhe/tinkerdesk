/**
 * modules/index.ts — Prompt-modules unified export
 *
 * All 15 modules of the service/prompt package.
 */
export {PromptModuleBase} from './prompt-module-base'
export {
  ToolEnforcementModule,
  TaskCompletionModule,
  OpenAIExecutionModule,
  GoogleOperationalModule,
  MemoryGuidanceModule,
  SessionSearchModule,
} from './preset-module-impls'
export {SystemContextModule} from './system-context-module'
export {RuntimeEnvironmentModule} from './runtime-environment-module'
export {SkillsIndexModule} from './skills-index-module'
export {MemorySnapshotModule} from './memory-snapshot-module'
export {SoulPromptModule} from './soul-prompt-module'
export {UserProfileModule} from './user-profile-module'
export type {IDynamicPromptModule, ConversationContext} from '../../core/prompt/types'
