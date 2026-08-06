/**
 * agent-mode-prompt-module.ts — Agent 模式提示词模块
 *
 * 复刻 tinker-agent AgentModePromptModule：
 * 渲染 Agent Mode 对应的 .hbs 提示词模板（agent-mode-{id}.hbs）。
 * 模板名来自 SessionContext 携带的 agentModeId（对齐 Java getAgentModePrompt）。
 */
import type {ConversationContext} from '../types'
import type {PromptRenderer} from '../renderer'

/** Agent 模式提示词模块 */
export class AgentModePromptModule {
  readonly id = 'agent-mode-prompt'

  constructor(private readonly renderer: PromptRenderer) {}

  shouldLoad(ctx: ConversationContext): boolean {
    // 对齐 Java：模式未配置 promptTemplate 时不加载
    const templateName = ctx.agentMode?.meta.promptTemplate
    return !!templateName && String(templateName).trim() !== ''
  }

  loadPrompt(ctx: ConversationContext): string | null {
    // 模板名：AgentMode.meta.promptTemplate（对齐 Java getAgentModePrompt）
    const templateName = ctx.agentMode?.meta.promptTemplate || 'agent-mode-default'
    const ctxMap: Record<string, unknown> = {
      profile: ctx.profile,
      sessionId: ctx.sessionId,
      os: ctx.clientEnv?.os ?? '',
      type: ctx.clientEnv?.clientType ?? '',
      date: new Date().toISOString().slice(0, 10),
    }
    const result = this.renderer.render(templateName, ctxMap)
    return result && result.trim() !== '' ? result : null
  }
}
