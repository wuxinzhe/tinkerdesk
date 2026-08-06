/**
 * agent-config-service.ts — Agent 运行参数服务层
 *
 * 复刻 tinker-agent AgentConfig 相关逻辑（本地单用户版）：
 * - get：读取配置，**查不到即报错**（配置缺失是问题，不静默兜底）
 * - update：仅对已有配置行做字段合并，无行报错
 * - reset：按 Agent 的 mode 取 getDefaultConfig() 重置（默认值唯一来源 = DefaultAgentMode）
 * - 默认配置模板只在创建 Agent 时由 AgentService 写入（getDefaultConfig 不滥用）
 */
import {AgentConfigRepository} from '../repository/agent-config-repository'
import type {AgentConfigEntity} from '../repository/types'
import type {AgentConfig} from '../core/loop/types'
import type {AgentModeRegistry} from '../core/mode/agent-mode-registry'
import type {AgentService} from './agent-service'

/** Agent 运行参数服务 */
export class AgentConfigService {
  constructor(
    private readonly configRepo: AgentConfigRepository,
    private readonly agentService: AgentService,
    private readonly agentModeRegistry?: AgentModeRegistry
  ) { }

  /** 读取配置（无 DB 行时抛错——配置缺失是异常，不静默返回默认值） */
  get(profile: string): AgentConfig {
    const entity = this.configRepo.findById(profile)
    if (!entity) {
      throw new Error(`Agent 配置不存在: ${profile}（请先完成初始化或重置配置）`)
    }
    return toConfig(entity)
  }

  /** 是否存在持久化配置行（初始化 Step2 检查用：默认 Agent 是否有完整 AgentConfig） */
  hasRow(profile: string): boolean {
    return this.configRepo.findById(profile) != null
  }

  /** 容错读取（无 DB 行返回 null——初始化向导回显用，不抛错） */
  getOrNull(profile: string): AgentConfig | null {
    const entity = this.configRepo.findById(profile)
    return entity ? toConfig(entity) : null
  }

  /** 字段级检查：返回缺失字段名列表（空数组 = 配置完整）。含 agentSoulPrompt——每个参数都必须有值 */
  missingFields(config: AgentConfig): string[] {
    const fields: Array<[string, unknown]> = [
      ['maxIterations', config.maxIterations],
      ['toolExecutionTimeout', config.toolExecutionTimeout],
      ['maxConversations', config.maxConversations],
      ['memoryMaxChars', config.memoryMaxChars],
      ['userMaxChars', config.userMaxChars],
      ['thresholdPercent', config.thresholdPercent],
      ['tailRatio', config.tailRatio],
      ['warningsEnabled', config.warningsEnabled],
      ['hardStopEnabled', config.hardStopEnabled],
      ['exactFailureWarnAfter', config.exactFailureWarnAfter],
      ['sameToolFailureWarnAfter', config.sameToolFailureWarnAfter],
      ['noProgressWarnAfter', config.noProgressWarnAfter],
      ['exactFailureBlockAfter', config.exactFailureBlockAfter],
      ['sameToolFailureHaltAfter', config.sameToolFailureHaltAfter],
      ['noProgressBlockAfter', config.noProgressBlockAfter],
      ['agentSoulPrompt', config.agentSoulPrompt],
    ]
    return fields.filter(([, v]) => v === null || v === undefined || v === '').map(([k]) => k)
  }

  /** 合并写入（初始化 Step2 保存：partial > existing > defaults 三级兜底，避免覆盖已有值） */
  upsert(profile: string, partial: Record<string, unknown>): void {
    // 1. defaults：Agent mode 默认配置（兜底缺省值）
    const agent = this.agentService.getAgentInfo(profile)
    const mode = agent
      ? (this.agentModeRegistry?.getAgentMode(agent.agentModeId) ?? this.agentModeRegistry?.getAgentMode('default'))
      : undefined
    const defaults = mode?.getDefaultConfig()
    // 2. existing：DB 行（已有值优先于 defaults）
    const existing = this.configRepo.findById(profile)
    const merged: AgentConfigEntity = {
      profile,
      maxIterations: numberOr(partial.maxIterations, existing?.maxIterations ?? defaults?.maxIterations ?? 0),
      thresholdPercent: numberOr(partial.thresholdPercent, existing?.thresholdPercent ?? defaults?.thresholdPercent ?? 0),
      tailRatio: numberOr(partial.tailRatio, existing?.tailRatio ?? defaults?.tailRatio ?? 0),
      toolExecutionTimeout: numberOr(partial.toolExecutionTimeout, existing?.toolExecutionTimeout ?? defaults?.toolExecutionTimeout ?? 0),
      maxConversations: numberOr(partial.maxConversations, existing?.maxConversations ?? defaults?.maxConversations ?? 0),
      memoryMaxChars: numberOr(partial.memoryMaxChars, existing?.memoryMaxChars ?? defaults?.memoryMaxChars ?? 0),
      userMaxChars: numberOr(partial.userMaxChars, existing?.userMaxChars ?? defaults?.userMaxChars ?? 0),
      agentSoulPrompt: strOr(partial.agentSoulPrompt, existing?.agentSoulPrompt ?? defaults?.agentSoulPrompt ?? null),
      warningsEnabled: boolOr(partial.warningsEnabled, existing?.warningsEnabled ?? (defaults?.warningsEnabled ? 1 : 0)),
      hardStopEnabled: boolOr(partial.hardStopEnabled, existing?.hardStopEnabled ?? (defaults?.hardStopEnabled ? 1 : 0)),
      exactFailureWarnAfter: numberOr(partial.exactFailureWarnAfter, existing?.exactFailureWarnAfter ?? defaults?.exactFailureWarnAfter ?? 0),
      sameToolFailureWarnAfter: numberOr(partial.sameToolFailureWarnAfter, existing?.sameToolFailureWarnAfter ?? defaults?.sameToolFailureWarnAfter ?? 0),
      noProgressWarnAfter: numberOr(partial.noProgressWarnAfter, existing?.noProgressWarnAfter ?? defaults?.noProgressWarnAfter ?? 0),
      exactFailureBlockAfter: numberOr(partial.exactFailureBlockAfter, existing?.exactFailureBlockAfter ?? defaults?.exactFailureBlockAfter ?? 0),
      sameToolFailureHaltAfter: numberOr(partial.sameToolFailureHaltAfter, existing?.sameToolFailureHaltAfter ?? defaults?.sameToolFailureHaltAfter ?? 0),
      noProgressBlockAfter: numberOr(partial.noProgressBlockAfter, existing?.noProgressBlockAfter ?? defaults?.noProgressBlockAfter ?? 0),
    }
    this.configRepo.save(merged)
  }

  /** 更新配置（仅对已有行做字段合并；无行抛错——配置不存在不能更新） */
  update(profile: string, config: Record<string, unknown>): void {
    const existing = this.configRepo.findById(profile)
    if (!existing) {
      throw new Error(`Agent 配置不存在: ${profile}（请先创建 Agent 或重置配置）`)
    }
    const merged: AgentConfigEntity = {
      profile,
      maxIterations: numberOr(config.maxIterations, existing.maxIterations),
      thresholdPercent: numberOr(config.thresholdPercent, existing.thresholdPercent),
      tailRatio: numberOr(config.tailRatio, existing.tailRatio),
      toolExecutionTimeout: numberOr(config.toolExecutionTimeout, existing.toolExecutionTimeout),
      maxConversations: numberOr(config.maxConversations, existing.maxConversations),
      memoryMaxChars: numberOr(config.memoryMaxChars, existing.memoryMaxChars),
      userMaxChars: numberOr(config.userMaxChars, existing.userMaxChars),
      agentSoulPrompt: strOr(config.agentSoulPrompt, existing.agentSoulPrompt),
      warningsEnabled: boolOr(config.warningsEnabled, existing.warningsEnabled),
      hardStopEnabled: boolOr(config.hardStopEnabled, existing.hardStopEnabled),
      exactFailureWarnAfter: numberOr(config.exactFailureWarnAfter, existing.exactFailureWarnAfter),
      sameToolFailureWarnAfter: numberOr(config.sameToolFailureWarnAfter, existing.sameToolFailureWarnAfter),
      noProgressWarnAfter: numberOr(config.noProgressWarnAfter, existing.noProgressWarnAfter),
      exactFailureBlockAfter: numberOr(config.exactFailureBlockAfter, existing.exactFailureBlockAfter),
      sameToolFailureHaltAfter: numberOr(config.sameToolFailureHaltAfter, existing.sameToolFailureHaltAfter),
      noProgressBlockAfter: numberOr(config.noProgressBlockAfter, existing.noProgressBlockAfter),
    }
    this.configRepo.save(merged)
  }

  /** 重置为默认配置（对齐 Java reset：按 Agent 的 mode 取 getDefaultConfig 预设，Agent 不存在返回 null） */
  reset(profile: string): AgentConfig | null {
    const agent = this.agentService.getAgentInfo(profile)
    if (!agent) {
      return null
    }
    // 查 Agent 的 mode → 用 mode 的默认配置（默认值唯一来源 = DefaultAgentMode.getDefaultConfig）
    const mode = this.agentModeRegistry?.getAgentMode(agent.agentModeId) ?? this.agentModeRegistry?.getAgentMode('default')
    if (!mode) {
      throw new Error(`Agent Mode 未注册: ${agent.agentModeId}（无法获取默认配置）`)
    }
    const defaults = mode.getDefaultConfig()
    this.configRepo.save({
      profile,
      maxIterations: defaults.maxIterations,
      thresholdPercent: defaults.thresholdPercent,
      tailRatio: defaults.tailRatio,
      toolExecutionTimeout: defaults.toolExecutionTimeout,
      maxConversations: defaults.maxConversations,
      memoryMaxChars: defaults.memoryMaxChars,
      userMaxChars: defaults.userMaxChars,
      agentSoulPrompt: defaults.agentSoulPrompt ?? null,
      warningsEnabled: defaults.warningsEnabled ? 1 : 0,
      hardStopEnabled: defaults.hardStopEnabled ? 1 : 0,
      exactFailureWarnAfter: defaults.exactFailureWarnAfter,
      sameToolFailureWarnAfter: defaults.sameToolFailureWarnAfter,
      noProgressWarnAfter: defaults.noProgressWarnAfter,
      exactFailureBlockAfter: defaults.exactFailureBlockAfter,
      sameToolFailureHaltAfter: defaults.sameToolFailureHaltAfter,
      noProgressBlockAfter: defaults.noProgressBlockAfter,
    })
    return defaults
  }
}

/** AgentConfigEntity → AgentConfig（DB 行存在即完整，直接映射） */
function toConfig(e: AgentConfigEntity): AgentConfig {
  return {
    maxIterations: e.maxIterations,
    toolExecutionTimeout: e.toolExecutionTimeout,
    maxConversations: e.maxConversations,
    memoryMaxChars: e.memoryMaxChars,
    userMaxChars: e.userMaxChars,
    thresholdPercent: e.thresholdPercent,
    tailRatio: e.tailRatio,
    agentSoulPrompt: e.agentSoulPrompt,
    warningsEnabled: e.warningsEnabled ? true : false,
    hardStopEnabled: e.hardStopEnabled ? true : false,
    exactFailureWarnAfter: e.exactFailureWarnAfter,
    sameToolFailureWarnAfter: e.sameToolFailureWarnAfter,
    noProgressWarnAfter: e.noProgressWarnAfter,
    exactFailureBlockAfter: e.exactFailureBlockAfter,
    sameToolFailureHaltAfter: e.sameToolFailureHaltAfter,
    noProgressBlockAfter: e.noProgressBlockAfter,
  }
}

function numberOr(v: unknown, d: number): number {
  return typeof v === 'number' ? v : d
}
function strOr(v: unknown, d: string | null): string | null {
  return typeof v === 'string' ? v : d
}
function boolOr(v: unknown, d: number): number {
  return typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'number' ? v : d
}
