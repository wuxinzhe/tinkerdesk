/**
 * preset-modules.ts — Template-only preset modules (HandlebarsPresetModule subclasses)
 *
 * - ToolEnforcementModule (tool-enforcement)
 * - TaskCompletionModule (task-completion)
 * - OpenAIExecutionModule (openai-execution)
 * - GoogleOperationalModule（google-operational）
 * - MemoryGuidanceModule（memory，条件：memory 工具可用）
 * - SessionSearchModule（session-search，条件：session_search 工具可用）
 */
import type {ConversationContext} from '../../core/prompt/types'
import type {PromptRenderer} from '../../core/prompt/renderer'
import {PromptModuleBase} from './prompt-module-base'
import {TOOL_MEMORY} from '../../core/constants'

/** 工具强制使用（无条件加载） */
export const PROMPT_TOOL_ENFORCEMENT = 'tool-enforcement'
export const PROMPT_TASK_COMPLETION = 'task-completion'
export const PROMPT_OPENAI_EXECUTION = 'openai-execution'
export const PROMPT_GOOGLE_OPERATIONAL = 'google-operational'
export const PROMPT_MEMORY = 'memory'
export const PROMPT_SESSION_SEARCH = 'session-search'

export class ToolEnforcementModule extends PromptModuleBase {
  readonly id = PROMPT_TOOL_ENFORCEMENT
  constructor(renderer: PromptRenderer) {
    super(renderer)
  }
}

/** 任务完成规范（无条件加载） */
export class TaskCompletionModule extends PromptModuleBase {
  readonly id = PROMPT_TASK_COMPLETION
  constructor(renderer: PromptRenderer) {
    super(renderer)
  }
}

/** OpenAI 执行规范（仅 OpenAI 系模型加载——gpt/o1/o3/o4 或 api.openai.com） */
export class OpenAIExecutionModule extends PromptModuleBase {
  readonly id = PROMPT_OPENAI_EXECUTION
  constructor(renderer: PromptRenderer) {
    super(renderer)
  }
  override shouldLoad(ctx: ConversationContext): boolean {
    const m = ctx.getMainModelConfig()
    if (!m) return false
    const name = m.modelName.toLowerCase()
    const url = (m.baseUrl ?? '').toLowerCase()
    return /^(gpt|o1|o3|o4)-/.test(name) || url.includes('api.openai.com')
  }
}

/** Google 操作规范（仅 Google 系模型加载——gemini 或 googleapis/generativelanguage） */
export class GoogleOperationalModule extends PromptModuleBase {
  readonly id = PROMPT_GOOGLE_OPERATIONAL
  constructor(renderer: PromptRenderer) {
    super(renderer)
  }
  override shouldLoad(ctx: ConversationContext): boolean {
    const m = ctx.getMainModelConfig()
    if (!m) return false
    const name = m.modelName.toLowerCase()
    const url = (m.baseUrl ?? '').toLowerCase()
    return name.startsWith('gemini') || url.includes('googleapis') || url.includes('generativelanguage')
  }
}

/** 记忆使用指南（memory 工具可用时加载） */
export class MemoryGuidanceModule extends PromptModuleBase {
  readonly id = PROMPT_MEMORY
  constructor(renderer: PromptRenderer) {
    super(renderer)
  }
  override shouldLoad(ctx: ConversationContext): boolean {
    return ctx.toolNames?.includes(TOOL_MEMORY) ?? false
  }
}

/** 会话搜索（session_search 工具可用时加载） */
export class SessionSearchModule extends PromptModuleBase {
  readonly id = PROMPT_SESSION_SEARCH
  constructor(renderer: PromptRenderer) {
    super(renderer)
  }
  override shouldLoad(ctx: ConversationContext): boolean {
    return ctx.toolNames?.includes('builtin_tinker_session_search') ?? false
  }
}
