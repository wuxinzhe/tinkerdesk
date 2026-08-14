/**
 * types.ts — Prompt-module system unified type definitions
 *
 * core/prompt:
 * IDynamicPromptModule / PromptModuleEntry / PromptModuleMeta.
 *
 * The prompt-module render context = ConversationContext (loop layer);
 * modules consume the conversation context directly — no intermediate
 * PromptContext object is defined.
 */
import type {ConversationContext} from '../loop/types'

export type {ConversationContext}

/** 动态提示词模块接口（对应 IDynamicPromptModule） */
export interface IDynamicPromptModule {
  /** 模块标识（全局唯一） */
  readonly id: string
  /** 判断本次对话是否需要加载此模块 */
  shouldLoad(ctx: ConversationContext): boolean
  /** 渲染提示词文本（空/null 表示无输出） */
  loadPrompt(ctx: ConversationContext): string | null
  /** 关联数据变更时刷新内部缓存（默认 no-op） */
  refreshCache?(): void
}

/** 动态模块条目（对应 PromptModuleEntry：id + module 包装） */
export interface PromptModuleEntry {
  id: string
  module: IDynamicPromptModule
}

/** 静态模块（用户自定义，存 SQLite） */
export interface StaticPromptModule {
  id: string
  content: string
  enabled: boolean
  sortOrder: number
}

/** 静态模块仓库接口（由上层注入，对接 SQLite） */
export interface IStaticPromptModuleRepository {
  findByProfile(profile: string): StaticPromptModule[]
}
