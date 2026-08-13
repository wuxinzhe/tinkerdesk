/**
 * service/agent/default-agent-mode.ts — 默认 Agent Mode
 *
 * 复刻 tinker-agent DefaultAgentMode（全功能默认实现）：
 * - 元数据：id=default, version=1.0, 通用模式
 * - getModuleList：动态提示词模块渲染顺序
 * - getDefaultConfig：agent_configs 无行时的配置兜底
 */
import type { AgentConfig } from '../../core/loop/types'
import type { IAgentMode } from '../../core/mode/agent-mode'
import type { PromptRenderer } from '../../core/prompt/renderer'

/** 默认 Agent Mode 元数据 */
const META = {
  id: 'default',
  version: '1.0',
  name: '通用模式',
  description: '通用对话模式，适合大多数场景',
  promptTemplate: 'agent-mode-default',
}

/** 动态模块渲染顺序 */
const MODULE_ORDER = [
  // pre
  'soul-prompt',
  'task-completion', 'tool-enforcement',
  // mid
  'memory', 'session-search',
  'skills-index',
  'memory-snapshot', 'user-profile',
  // post
  'openai-execution', 'google-operational',
]

/** 默认 Agent Mode 实现 */
export class DefaultAgentMode implements IAgentMode {
  readonly meta = META

  /** 运行时已渲染的灵魂提示词文本 */
  private readonly soulPromptTemp: string

  constructor(promptRenderer: PromptRenderer) {
    // Bean 实例化时即将 getAgentModePrompt() 指定的模板渲染为最终文本
    const templateName = META.promptTemplate
    const ctxMap: Record<string, unknown> = {
      date: new Date().toISOString().slice(0, 10),
    }
    const rendered = promptRenderer.render(templateName, ctxMap)
    this.soulPromptTemp = rendered ?? ''
  }

  getModuleList(): string[] {
    return MODULE_ORDER
  }

  getDefaultConfig(): AgentConfig {
    return {
      maxIterations: 90,
      toolExecutionTimeout: 120,
      maxConversations: 5,
      memoryMaxChars: 2200,
      userMaxChars: 1375,
      thresholdPercent: 0.5,
      tailRatio: 0.2,
      warningsEnabled: true,
      hardStopEnabled: false,
      exactFailureWarnAfter: 2,
      sameToolFailureWarnAfter: 3,
      noProgressWarnAfter: 2,
      exactFailureBlockAfter: 5,
      sameToolFailureHaltAfter: 8,
      noProgressBlockAfter: 5,
      messageBusyMode: 'queue',
      agentSoulPrompt: this.soulPromptTemp
    }
  }
}
