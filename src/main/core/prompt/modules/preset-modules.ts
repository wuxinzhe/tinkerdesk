/**
 * preset-modules.ts — 纯模板预设模块（复刻 tinker-agent 的 HandlebarsPresetModule 子类）
 *
 * - ToolEnforcementModule（tool-enforcement）
 * - TaskCompletionModule（task-completion）
 * - OpenAIExecutionModule（openai-execution）
 * - GoogleOperationalModule（google-operational）
 * - MemoryGuidanceModule（memory，条件：memory 工具可用）
 * - SessionSearchModule（session-search，条件：session_search 工具可用）
 */
import type {ConversationContext} from '../types'
import type {PromptRenderer} from '../renderer'
import {HandlebarsPresetModule} from './preset-module'

/** 工具强制使用（无条件加载） */
export class ToolEnforcementModule extends HandlebarsPresetModule {
  readonly id = 'tool-enforcement'
  constructor(renderer: PromptRenderer) {
    super(renderer)
  }
}

/** 任务完成规范（无条件加载） */
export class TaskCompletionModule extends HandlebarsPresetModule {
  readonly id = 'task-completion'
  constructor(renderer: PromptRenderer) {
    super(renderer)
  }
}

/** OpenAI 执行规范（无条件加载） */
export class OpenAIExecutionModule extends HandlebarsPresetModule {
  readonly id = 'openai-execution'
  constructor(renderer: PromptRenderer) {
    super(renderer)
  }
}

/** Google 操作规范（无条件加载） */
export class GoogleOperationalModule extends HandlebarsPresetModule {
  readonly id = 'google-operational'
  constructor(renderer: PromptRenderer) {
    super(renderer)
  }
}

/** 记忆使用指南（memory 工具可用时加载） */
export class MemoryGuidanceModule extends HandlebarsPresetModule {
  readonly id = 'memory'
  constructor(renderer: PromptRenderer) {
    super(renderer)
  }
  override shouldLoad(ctx: ConversationContext): boolean {
    return ctx.toolNames?.includes('builtin_tinker_memory') ?? false
  }
}

/** 会话搜索（session_search 工具可用时加载） */
export class SessionSearchModule extends HandlebarsPresetModule {
  readonly id = 'session-search'
  constructor(renderer: PromptRenderer) {
    super(renderer)
  }
  override shouldLoad(ctx: ConversationContext): boolean {
    return ctx.toolNames?.includes('builtin_tinker_session_search') ?? false
  }
}
