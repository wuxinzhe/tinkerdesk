/**
 * preset-module.ts — Handlebars 预设模块基类
 *
 * 复刻 tinker-agent HandlebarsPresetModule：
 * 系统预设模块继承此类，通过 PromptRenderer 加载 {id}.hbs 模板。
 * 默认无条件加载（shouldLoad=true），子类可重写。
 */
import type {IDynamicPromptModule, ConversationContext} from '../types'
import type {PromptRenderer} from '../renderer'

/** Handlebars 预设模块基类 */
export abstract class HandlebarsPresetModule implements IDynamicPromptModule {
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
