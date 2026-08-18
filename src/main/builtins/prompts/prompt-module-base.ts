/**
 * preset-module.ts — Handlebars 预设模块基类
 *
 * PromptModuleBase:
 * System preset modules extend this base class; it loads the {id}.hbs template
 * via PromptRenderer. Loads unconditionally by default (shouldLoad=true);
 * subclasses may override.
 */
import type {IDynamicPromptModule, ConversationContext} from '../../core/prompt/types'
import type {PromptRenderer} from '../../core/prompt/renderer'

/** Handlebars 预设模块基类 */
export abstract class PromptModuleBase implements IDynamicPromptModule {
  protected readonly renderer: PromptRenderer

  constructor(renderer: PromptRenderer) {
    this.renderer = renderer
  }

  abstract readonly id: string

  shouldLoad(_ctx: ConversationContext): boolean {
    return true
  }

  loadPrompt(ctx: ConversationContext): string | null {
    const ctxMap = this.buildContextMap(ctx)
    const result = this.renderer.render(this.id, ctxMap)
    return result && result.trim() !== '' ? result : null
  }

  /** 构建模板变量映射 */
  private buildContextMap(ctx: ConversationContext): Record<string, unknown> {
    return {
      sessionId: ctx.sessionId,
      profile: ctx.profile,
      os: ctx.clientEnv?.os ?? '',
      type: ctx.clientEnv?.clientType ?? '',
      date: new Date().toISOString().slice(0, 10),
    }
  }
}
