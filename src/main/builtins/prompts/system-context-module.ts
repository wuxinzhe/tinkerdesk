/**
 * system-context-module.ts — 系统上下文模块
 *
 * SystemContextModule:
 * Renders context.hbs (Session ID / date / model name).
 */
import type {ConversationContext} from '../../core/prompt/types'
import type {PromptRenderer} from '../../core/prompt/renderer'
import {PromptModuleBase} from './prompt-module-base'

/** 系统上下文模块 */
export const PROMPT_SYSTEM_CONTEXT = 'system-context'

export class SystemContextModule extends PromptModuleBase {
  readonly id = PROMPT_SYSTEM_CONTEXT
  constructor(renderer: PromptRenderer) {
    super(renderer)
  }

  override loadPrompt(ctx: ConversationContext): string | null {
    const ctxMap: Record<string, unknown> = {
      sessionId: ctx.sessionId,
      date: new Date().toISOString().slice(0, 10),
    }
    const modelName = ctx.getMainModelConfig?.()?.modelName ?? ''
    if (modelName && String(modelName).trim() !== '') {
      ctxMap.modelName = modelName
    }
    const result = this.renderer.render('context', ctxMap)
    return result && result.trim() !== '' ? result : null
  }
}
