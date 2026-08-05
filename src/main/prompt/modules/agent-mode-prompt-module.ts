/**
 * agent-mode-prompt-module.ts — Agent 模式提示词模块
 *
 * 复刻 showing-agent AgentModePromptModule：
 * 渲染 agent-mode-default.hbs（Agent 模式的主提示词骨架）。
 * 本地单用户版：默认加载默认模式模板。
 */
import type {PromptContext} from '../types'
import type {PromptRenderer} from '../renderer'

/** Agent 模式提示词模块 */
export class AgentModePromptModule {
  readonly id = 'agent-mode-prompt'

  constructor(private readonly renderer: PromptRenderer) {}

  shouldLoad(_ctx: PromptContext): boolean {
    return true
  }

  loadPrompt(ctx: PromptContext): string | null {
    const ctxMap: Record<string, unknown> = {
      profile: ctx.profile,
      sessionId: ctx.sessionId,
      os: ctx.clientEnv?.os ?? '',
      type: ctx.clientEnv?.clientType ?? '',
      date: new Date().toISOString().slice(0, 10),
    }
    const result = this.renderer.render('agent-mode-default', ctxMap)
    return result && result.trim() !== '' ? result : null
  }
}
