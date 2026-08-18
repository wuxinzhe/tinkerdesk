/**
 * prompt/index.ts — Prompt-module system unified export
 *
 * core/prompt + service/prompt (TS version).
 */
export {PromptManager} from './prompt-manager'
export {PromptModuleBuilder} from './prompt-module-builder'
export {PromptRenderer} from './renderer'
export {HandlebarsPresetModule} from '../../builtins/prompts/preset-module'
export {
  ToolEnforcementModule,
  TaskCompletionModule,
  OpenAIExecutionModule,
  GoogleOperationalModule,
  MemoryGuidanceModule,
  SessionSearchModule,
} from '../../builtins/prompts/preset-modules'
export {SystemContextModule} from '../../builtins/prompts/system-context-module'
export {RuntimeEnvironmentModule} from '../../builtins/prompts/runtime-environment-module'
export {SkillsIndexModule} from '../../builtins/prompts/skills-index-module'
export {MemorySnapshotModule} from '../../builtins/prompts/memory-snapshot-module'
export {SoulPromptModule} from '../../builtins/prompts/soul-prompt-module'
export {UserProfileModule} from '../../builtins/prompts/user-profile-module'
export type {StaticPromptModule, IStaticPromptModuleRepository} from './prompt-module-builder'
export type {
  IDynamicPromptModule,
  PromptModuleEntry,
  ConversationContext,
} from './types'
