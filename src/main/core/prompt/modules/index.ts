/**
 * modules/index.ts — Prompt-modules unified export
 *
 * All 15 modules of the service/prompt package.
 */
export {HandlebarsPresetModule} from './preset-module'
export {
  ToolEnforcementModule,
  TaskCompletionModule,
  OpenAIExecutionModule,
  GoogleOperationalModule,
  MemoryGuidanceModule,
  SessionSearchModule,
} from './preset-modules'
export {SystemContextModule} from './system-context-module'
export {RuntimeEnvironmentModule} from './runtime-environment-module'
export {SkillsIndexModule} from './skills-index-module'
export {MemorySnapshotModule} from './memory-snapshot-module'
export {SoulPromptModule} from './soul-prompt-module'
export {UserProfileModule} from './user-profile-module'
export type {IDynamicPromptModule, ConversationContext} from '../types'
