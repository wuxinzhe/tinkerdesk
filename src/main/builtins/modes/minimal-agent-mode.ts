/**
 * service/agent/minimal-agent-mode.ts — 极简 Agent Mode
 *
 * MinimalAgentMode（极简模式）：
 * - 只暴露内建核心业务工具（记忆/待办/澄清/对话搜索/技能）——不给终端/文件/网页等超出自研软件的对外能力
 * - getToolset 返回具体工具名（静态配置好一套——不自由选配）
 * - 默认配置/动态模块顺序复用通用默认
 */

import type { AgentConfig } from '../../core/loop/types'
import { BUSY_MODE_QUEUE } from '../../core/loop/types'
import type { IAgentMode } from '../../core/mode/agent-mode'
import { TERMINAL_TOOL_NAME, PWSH_TOOL_NAME, READ_FILE_TOOL_NAME, WRITE_FILE_TOOL_NAME, PATCH_TOOL_NAME } from '../tools'
import { PROMPT_TOOL_ENFORCEMENT } from '../prompts/preset-module-impls'

/** 极简模式元数据 */
const META = {
  id: 'minimal',
  version: '1.0',
  name: '极简模式',
  description: '极简模式——只保留文件读写与终端工具（terminal/pwsh/read_file/write_file/patch），面向代码任务的极简 Agent',
  promptTemplate: 'agent-mode-minimal',
}

/** 极简工具集：仅文件读写与终端工具（硬编码一套——不可自由选配） */
const MINIMAL_TOOLSET = [
  TERMINAL_TOOL_NAME,
  PWSH_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  PATCH_TOOL_NAME,
]

/** 动态模块渲染顺序（只保留与这几个工具相关的模块——工具执行约束） */
const PROMPT_LIST = [
  PROMPT_TOOL_ENFORCEMENT,
]

/** 极简 Agent Mode 实现 */
export class MinimalAgentMode implements IAgentMode {
  readonly meta = META

  getPromptList(): string[] {
    return PROMPT_LIST
  }

  /** 极简工具集：静态配置好的具体工具名（不查任何表） */
  getToolset(_profile?: string): string[] {
    return [...MINIMAL_TOOLSET]
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
