/**
 * agent-manager-controller.ts — Agent 配置 IPC controller（class 形式）
 *
 * AgentManagerController (local single-user, no userId/mode registry):
 * Agent list / create / detail / update / delete.
 * Layering: controller → service (AgentService), never touches repository directly.
 * IPC prefix: agent-cfg:*
 *
 * Structure: register() only binds ipcMain.handle; logic lives in
 * named methods with fully typed params/returns.
 */

import { handleTrusted } from '../security/ipc-guard'
import type { AgentService } from '../service/agent-service'
import { MemoryStore } from '../service/memory-store'
import type { AgentConfigService } from '../service/agent-config-service'
import type { AgentInfoDTO, CreateAgentRequestDTO, UpdateAgentRequestDTO } from '../service/types'
import type { ApiResponse } from './api-response'
import { fail, ok } from './api-response'

/** 单用户版查询上限 */
const MAX_LIMIT = 200

/** Agent 配置 controller */
export class AgentCrudController {
  constructor(
    private readonly agentService: AgentService,
    private readonly memoryStore?: MemoryStore,
    private readonly agentConfigService?: AgentConfigService,
  ) { }

  /** 给 Agent 附带记忆占用（profile 级——记忆与 AgentInfo 一个接口一起取） */
  private enrichAgent(agent: AgentInfoDTO): AgentInfoDTO {
    if (!this.memoryStore || !this.agentConfigService) {
      return agent
    }
    try {
      const profile = agent.profile
      const memEntries = this.memoryStore.readAll(MemoryStore.TARGET_MEMORY, profile)
      const memChars = memEntries.reduce((sum, e) => sum + e.length, 0)
      const usrEntries = this.memoryStore.readAll(MemoryStore.TARGET_USER, profile)
      const usrChars = usrEntries.reduce((sum, e) => sum + e.length, 0)
      const cfg = this.agentConfigService.get(profile)
      const memMax = cfg.memoryMaxChars ?? 0
      const usrMax = cfg.userMaxChars ?? 0
      return {
        ...agent,
        memoryChars: memChars,
        memoryEntries: memEntries.length,
        memoryMaxChars: memMax,
        memoryPercent: memMax > 0 ? Math.min(memChars / memMax, 1) : 0,
        userChars: usrChars,
        userEntries: usrEntries.length,
        userMaxChars: usrMax,
        userPercent: usrMax > 0 ? Math.min(usrChars / usrMax, 1) : 0,
      }
    } catch {
      return agent
    }
  }

  /** 注册全部 IPC handler（只做绑定，逻辑在独立具名方法） */
  register(): void {
    handleTrusted('agent-cfg:list', (_event, payload) => this.listAgents(payload))
    handleTrusted('agent-cfg:create', (_event, payload) => this.createAgent(payload))
    handleTrusted('agent-cfg:get', (_event, profile) => this.getAgent(profile))
    handleTrusted('agent-cfg:update', (_event, payload) => this.updateAgent(payload))
    handleTrusted('agent-cfg:delete', (_event, profile) => this.deleteAgent(profile))
  }

  // ══════════════════════════════════════════════════════════════
  // 各 IPC 方法（具名方法 + 完整入参出参类型）
  // ══════════════════════════════════════════════════════════════

  /** 查询 Agent 列表（分页，每页 20；可按 profile 精确过滤） */
  private listAgents(payload: { profile?: string; limit?: number; offset?: number }): ApiResponse<AgentInfoDTO[]> {
    if (payload?.profile) {
      const agent = this.agentService.getAgentInfo(payload.profile)
      return ok(agent ? [this.enrichAgent(agent)] : [])
    }
    const limit = Math.min(payload?.limit ?? 20, MAX_LIMIT)
    const offset = payload?.offset ?? 0
    const { items } = this.agentService.listByUser('', offset, limit)
    return ok(items.map((a) => this.enrichAgent(a)))
  }

  /** 创建 Agent */
  private createAgent(payload: CreateAgentRequestDTO): ApiResponse<AgentInfoDTO> {
    if (!payload?.profile) {
      return fail('profile 不能为空')
    }
    const agent = this.agentService.create(payload)
    return agent ? ok(agent) : fail(`Agent 已存在: ${payload.profile}`)
  }

  /** 查询 Agent 详情 */
  private getAgent(profile: string): ApiResponse<AgentInfoDTO> {
    const agent = this.agentService.getAgentInfo(profile)
    return agent ? ok(this.enrichAgent(agent)) : fail('Agent not found')
  }

  /** 更新 Agent */
  private updateAgent(payload: UpdateAgentRequestDTO): ApiResponse<AgentInfoDTO> {
    const agent = this.agentService.update(payload)
    return agent ? ok(agent) : fail('Agent not found')
  }

  /** 删除 Agent */
  private deleteAgent(profile: string): ApiResponse<null> {
    const deleted = this.agentService.delete(profile)
    return deleted ? ok(null) : fail('Agent not found')
  }
}
