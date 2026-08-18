/**
 * service/agent/butler-agent-mode.ts — 管家 Agent Mode（特殊）
 *
 * ButlerAgentMode（管家模式）：
 * - 特殊模式：getToolset / getModuleList / getDefaultConfig 当前都返回空（极简占位），后续细化。
 * - 安装管家能力后续通过本模式实现——无需再创 Agent——只要把某 Agent 切到管家模式即进入管家决策。
 * - 所有配置写死（代码注册）——用户不能修改。
 * - 天然受限：toolset 为空 → 无任何工具（外部/内置都不可用）——隔离最严。
 */

import type { AgentConfig } from '../../core/loop/types'
import { BUSY_MODE_QUEUE } from '../../core/loop/types'
import type { IAgentMode } from '../../core/mode/agent-mode'

/** 管家模式元数据（写死——用户不可改） */
const META = {
  id: 'butler',
  version: '1.0',
  name: '管家模式',
  description: '管家模式——安装/管理应用的专职决策；当前配置暂空，后续细化，全部写死不可改',
  promptTemplate: 'agent-mode-butler',
}

/** 管家 Agent Mode 实现 */
export class ButlerAgentMode implements IAgentMode {
  readonly meta = META

  /** 提示词模块清单：暂空（后续细化管家决策提示词） */
  getPromptList(): string[] {
    return []
  }

  /** 工具集：暂空（后续细化——安装管家所需工具当前未定） */
  getToolset(_profile?: string): string[] {
    return []
  }

  /** Agent 配置：极简写死占位（后续细化；全部不可由用户改） */
  getDefaultConfig(): AgentConfig {
    return {
      maxIterations: 30,
      thresholdPercent: 0.8,
      tailRatio: 0.2,
      toolExecutionTimeout: 120,
      maxConversations: 1,
      memoryMaxChars: 800,
      warningsEnabled: false,
      hardStopEnabled: false,
      exactFailureWarnAfter: 2,
      sameToolFailureWarnAfter: 3,
      noProgressWarnAfter: 2,
      exactFailureBlockAfter: 5,
      sameToolFailureHaltAfter: 8,
      noProgressBlockAfter: 5,
      agentSoulPrompt: null,
      messageBusyMode: BUSY_MODE_QUEUE,
    }
  }
}
