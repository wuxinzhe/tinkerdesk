/**
 * service/agent/creator-agent-mode.ts — 创造者 Agent Mode
 *
 * CreatorAgentMode（创造者模式）：
 * - 唯一支持自由选配工具的模式：per-profile agent_tools 授权白名单定制
 *   - profile 有授权（agent_tools 非空）→ 返回授权工具集（自定义）
 *   - 空 → 回落全量（ToolManager 全部已注册工具名——含内置 + 外置安装）
 * - 工具授权表（agent_tools）只在创造者模式下被装配——其他模式静态配置
 */

import type { AgentConfig } from '../../core/loop/types'
import { BUSY_MODE_QUEUE } from '../../core/loop/types'
import type { IAgentMode } from '../../core/mode/agent-mode'
import type { ToolManager } from '../../core/tool/tool-manager'
import type { AgentToolService } from '../agent-tool-service'

/** 创造者模式元数据 */
const META = {
  id: 'creator',
  version: '1.0',
  name: '创造者模式',
  description: '创造者模式——自由选配工具（per-profile 授权白名单定制；未配置则全量）',
  promptTemplate: 'agent-mode-creator',
}

/** 动态模块渲染顺序（复用通用默认） */
const MODULE_ORDER = [
  'soul-prompt',
  'task-completion', 'tool-enforcement',
  'memory', 'session-search',
  'skills-index',
  'memory-snapshot', 'user-profile',
  'openai-execution', 'google-operational',
]

/** 创造者 Agent Mode 实现 */
export class CreatorAgentMode implements IAgentMode {
  readonly meta = META

  constructor(
    private readonly toolManager: ToolManager,
    private readonly agentToolService: AgentToolService,
  ) {}

  getModuleList(): string[] {
    return MODULE_ORDER
  }

  /** 创造者工具集：profile 有授权 → 授权集（自由选配）；空 → 全量（具体列名） */
  getToolset(profile?: string): string[] {
    if (profile) {
      const authorized = this.agentToolService.getAuthorized(profile)
      if (authorized.length > 0) return authorized
    }
    return this.toolManager.getAllToolNames()
  }

  getDefaultConfig(): AgentConfig {
    return {
      maxIterations: 90,
      toolExecutionTimeout: 120,
      maxConversations: 5,
      memoryMaxChars: 2200,
      thresholdPercent: 0.8,
      tailRatio: 0.2,
      warningsEnabled: true,
      hardStopEnabled: false,
      exactFailureWarnAfter: 2,
      sameToolFailureWarnAfter: 3,
      noProgressWarnAfter: 2,
      exactFailureBlockAfter: 5,
      sameToolFailureHaltAfter: 8,
      noProgressBlockAfter: 5,
      messageBusyMode: BUSY_MODE_QUEUE,
      agentSoulPrompt: '',
    }
  }
}
