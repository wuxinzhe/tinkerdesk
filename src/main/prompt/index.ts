/**
 * prompt/index.ts — 提示词模块系统统一出口
 *
 * 复刻 showing-agent core/prompt（TS 版）。
 */
export {PromptManager} from './prompt-manager'
export {PromptModuleBuilder} from './prompt-module-builder'
export type {StaticPromptModule, IStaticPromptModuleRepository} from './prompt-module-builder'
export type {
  IDynamicPromptModule,
  PromptModuleEntry,
  PromptContext,
} from './types'
