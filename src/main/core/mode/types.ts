/**
 * core/mode/types.ts — Agent Mode 包类型定义
 *
 * Agent Mode SPI + DTO 统一归位，实现文件（agent-mode-registry）从本文件导入。
 */
import type { AgentConfig } from '../loop/types'

/** Agent Mode 元数据 */
export interface AgentModeMeta {
  /** 模式 ID（唯一标识，agent 表 agent_mode_id 引用） */
  id: string
  /** 模式版本（agent 表 agent_mode_version 引用） */
  version: string
  /** 显示名称 */
  name: string
  /** 描述 */
  description: string
  /** 模式提示词模板名（已废弃——persona 单一来源为 AgentConfig.agentSoulPrompt） */
  promptTemplate: string
}

/** Agent Mode SPI（组合元数据 + 模块顺序 + 默认配置 + 工具集） */
export interface IAgentMode {
  /** 模式元数据 */
  readonly meta: AgentModeMeta

  /** 动态提示词模块渲染顺序（对应 PromptModule 的 id 列表） */
  getPromptList(): string[]

  /** agent_configs 无行时的默认配置 */
  getDefaultConfig(): AgentConfig

  /**
   * 该 Agent 模式允许使用的工具名集合（per-agent 工具集白名单）。
   * 返回**具体工具名**（直接写名字——不用通配符）。profile 参数仅创造者模式按个性授权定制用；其余忽略。
   * 工具集归属 AgentMode（随模式走、可写死），不落 AgentConfig。
   */
  getToolset(profile?: string): string[]
}

/** 模式元数据 DTO */
export interface ModeInfoDTO {
  id: string
  version: string
  name: string
  description: string
  promptTemplate: string
}

/** 模式选项 */
export interface ModeOptionDTO {
  id: string
  versions: string[]
}
