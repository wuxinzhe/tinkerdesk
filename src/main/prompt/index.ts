/**
 * prompt/index.ts — 提示词模块系统统一出口
 *
 * 复刻 showing-agent core/prompt + service/prompt（TS 版）。
 */
export {PromptManager} from './prompt-manager'
export {PromptModuleBuilder} from './prompt-module-builder'
export {PromptRenderer} from './renderer'
export {HandlebarsPresetModule} from './modules/preset-module'
export {
  ToolEnforcementModule,
  TaskCompletionModule,
  OpenAIExecutionModule,
  GoogleOperationalModule,
  MemoryGuidanceModule,
  SessionSearchModule,
} from './modules/preset-modules'
export {SystemContextModule} from './modules/system-context-module'
export {RuntimeEnvironmentModule} from './modules/runtime-environment-module'
export {SkillsIndexModule} from './modules/skills-index-module'
export {MemorySnapshotModule} from './modules/memory-snapshot-module'
export {SoulPromptModule} from './modules/soul-prompt-module'
export {UserProfileModule} from './modules/user-profile-module'
export {AgentModePromptModule} from './modules/agent-mode-prompt-module'
export type {StaticPromptModule, IStaticPromptModuleRepository} from './prompt-module-builder'
export type {
  IDynamicPromptModule,
  PromptModuleEntry,
  PromptContext,
} from './types'
