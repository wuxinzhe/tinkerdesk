/**
 * agent-service.ts — Agent 配置服务层
 *
 * IAgentService / AgentService (local single-user, no userId):
 * listByUser / getAgentInfo / getDetail / create / update / delete.
 * DTO definitions centralized in ./types.ts.
 */
import { AgentRepository } from '../repository/agent-repository'
import type { AgentConfigRepository } from '../repository/agent-config-repository'
import type { AgentEntity, AgentConfigEntity } from '../repository/types'
import type { AgentModeRegistry } from '../core/mode/agent-mode-registry'
import type { AgentConfig } from '../core/loop/types'
import { nowDb } from '../utils/time'
import type { AgentInfoDTO, CreateAgentRequestDTO, UpdateAgentRequestDTO } from './types'

/** AgentConfig（模式默认配置）→ AgentConfigEntity（持久化行） */
function toConfigEntity(profile: string, c: AgentConfig): AgentConfigEntity {
  return {
    profile,
    maxIterations: c.maxIterations,
    thresholdPercent: c.thresholdPercent,
    tailRatio: c.tailRatio,
    toolExecutionTimeout: c.toolExecutionTimeout,
    maxConversations: c.maxConversations,
    memoryMaxChars: c.memoryMaxChars,
    userMaxChars: c.userMaxChars,
    agentSoulPrompt: c.agentSoulPrompt ?? null,
    warningsEnabled: c.warningsEnabled ? 1 : 0,
    hardStopEnabled: c.hardStopEnabled ? 1 : 0,
    exactFailureWarnAfter: c.exactFailureWarnAfter,
    sameToolFailureWarnAfter: c.sameToolFailureWarnAfter,
    noProgressWarnAfter: c.noProgressWarnAfter,
    exactFailureBlockAfter: c.exactFailureBlockAfter,
    sameToolFailureHaltAfter: c.sameToolFailureHaltAfter,
    noProgressBlockAfter: c.noProgressBlockAfter,
    messageBusyMode: c.messageBusyMode,
  }
}

/** AgentEntity → AgentInfoDTO */
export function toAgentInfoDTO(e: AgentEntity): AgentInfoDTO {
  return {
    profile: e.profile,
    displayName: e.displayName,
    description: e.description,
    avatar: e.avatar,
    isDefault: e.isDefault,
    isActive: e.isActive,
    agentModeId: e.agentModeId,
    agentModeVersion: e.agentModeVersion,
    createdAt: e.createdAt,
  }
}

/** Agent 配置服务 */
export class AgentService {
  constructor(
    private readonly agentRepo: AgentRepository,
    private readonly configRepo?: AgentConfigRepository,
    private readonly agentModeRegistry?: AgentModeRegistry
  ) { }

  /** 按用户分页查询（本地无分页，直接全量） */
  listByUser(_userId: string, offset = 0, limit = 50): { items: AgentInfoDTO[]; total: number } {
    const agents = this.agentRepo.findByUser()
    const items = agents.slice(offset, offset + limit).map(toAgentInfoDTO)
    return { items, total: agents.length }
  }

  /** 获取单个 Agent */
  getAgentInfo(profile: string): AgentInfoDTO | null {
    const entity = this.agentRepo.findById(profile)
    return entity ? toAgentInfoDTO(entity) : null
  }

  /** 获取详情 */
  getDetail(profile: string): AgentInfoDTO | null {
    return this.getAgentInfo(profile)
  }

  /** 创建：写 agents 表 + 用 AgentMode.getDefaultConfig() 初始化 agent_configs 预设 */
  create(req: CreateAgentRequestDTO): AgentInfoDTO | null {
    if (this.agentRepo.findById(req.profile)) {
      return null // 已存在
    }
    const agentModeId = req.agentModeId ?? 'default'
    const agentModeVersion = req.agentModeVersion ?? '1.0.0'
    const entity: AgentEntity = {
      profile: req.profile,
      displayName: req.displayName ?? req.profile,
      description: req.description ?? '',
      avatar: req.avatar ?? '',
      isDefault: req.isDefault ?? false,
      isActive: true,
      agentModeId,
      agentModeVersion,
      createdAt: nowDb(),
      deletedAt: null,
    }
    this.agentRepo.save(entity)

    // 用 AgentMode 的默认配置初始化 agent_configs（创建即得完整配置预设）
    if (this.configRepo && this.agentModeRegistry) {
      const mode = this.agentModeRegistry.getAgentMode(agentModeId) ?? this.agentModeRegistry.getAgentMode('default')
      const defaults = mode?.getDefaultConfig()
      if (defaults) {
        this.configRepo.save(toConfigEntity(req.profile, defaults))
      }
    }
    return toAgentInfoDTO(entity)
  }

  /** 查询默认 Agent */
  findDefaultAgent(): AgentInfoDTO | null {
    const agents = this.agentRepo.findByUser().filter((a) => a.isDefault && !a.deletedAt)
    return agents.length === 1 ? toAgentInfoDTO(agents[0]) : null
  }

  /** 更新 */
  update(req: UpdateAgentRequestDTO): AgentInfoDTO | null {
    const existing = this.agentRepo.findById(req.profile)
    if (!existing) {
      return null
    }
    const updated: AgentEntity = {
      ...existing,
      displayName: req.displayName ?? existing.displayName,
      description: req.description ?? existing.description,
      avatar: req.avatar ?? existing.avatar,
      agentModeId: req.agentModeId ?? existing.agentModeId,
      agentModeVersion: req.agentModeVersion ?? existing.agentModeVersion,
      isActive: req.isActive ?? existing.isActive,
    }
    this.agentRepo.save(updated)
    return toAgentInfoDTO(updated)
  }

  /** 删除 */
  delete(profile: string): boolean {
    return this.agentRepo.delete(profile) > 0
  }
}
