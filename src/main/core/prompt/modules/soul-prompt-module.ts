/**
 * soul-prompt-module.ts — 灵魂提示词模块
 *
 * 复刻 tinker-agent SoulPromptModule：
 * 从 Agent 配置加载灵魂提示词模板（agent_soul_prompt），渲染后注入。
 * 未配置时返回 null（跳过）。
 */
import type {ConversationContext} from '../types'
import type {PromptRenderer} from '../renderer'

/** 灵魂提示词模块 */
export class SoulPromptModule {
  readonly id = 'soul-prompt'

  constructor(private readonly renderer: PromptRenderer) {}

  shouldLoad(_ctx: ConversationContext): boolean {
    return true
  }

  loadPrompt(ctx: ConversationContext): string | null {
    const templateName = ctx.agentConfig?.agentSoulPrompt
    if (!templateName || String(templateName).trim() === '') {
      return null
    }
    const ctxMap: Record<string, unknown> = {
      profile: ctx.profile,
      sessionId: ctx.sessionId,
      os: ctx.clientEnv?.os ?? '',
      type: ctx.clientEnv?.clientType ?? '',
      date: new Date().toISOString().slice(0, 10),
    }
    const compiled = this.renderer.compileInline(String(templateName))
    if (!compiled) {
      return null
    }
    const result = compiled(ctxMap)
    return result && result.trim() !== '' ? result : null
  }
}
