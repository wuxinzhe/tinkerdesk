/**
 * agent-manager-controller.ts — Agent 配置 IPC controller（class 形式）
 *
 * 复刻 tinker-agent AgentController（本地单用户版，去 userId/模式注册表）：
 * Agent 列表 / 创建 / 详情 / 更新 / 删除。
 * 分层：controller → service（AgentService），不直接访问 repository。
 * IPC 前缀：agent-cfg:*
 *
 * 结构：register() 只做 ipcMain.handle 绑定，逻辑在独立具名方法（入参出参完整类型）。
 */
import { ipcMain } from 'electron'
import type { AgentService } from '../service/agent-service'
import { MemoryStore } from '../service/memory-store'
import type { AgentConfigService } from '../service/agent-config-service'
import type { AgentInfoDTO, CreateAgentRequestDTO, UpdateAgentRequestDTO } from '../service/types'
import type { ApiResponse } from './api-response'
import { fail, ok } from './api-response'

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
    ipcMain.handle('agent-cfg:list', (_event, payload) => this.listAgents(payload))
    ipcMain.handle('agent-cfg:create', (_event, payload) => this.createAgent(payload))
    ipcMain.handle('agent-cfg:get', (_event, profile) => this.getAgent(profile))
    ipcMain.handle('agent-cfg:update', (_event, payload) => this.updateAgent(payload))
    ipcMain.handle('agent-cfg:delete', (_event, profile) => this.deleteAgent(profile))
  }

  // ══════════════════════════════════════════════════════════════
  // 各 IPC 方法（具名方法 + 完整入参出参类型）
  // ══════════════════════════════════════════════════════════════

  /** 查询 Agent 列表（可按 profile 过滤） */
  private listAgents(payload: { profile?: string }): ApiResponse<AgentInfoDTO[]> {
    if (payload?.profile) {
      const agent = this.agentService.getAgentInfo(payload.profile)
      return ok(agent ? [this.enrichAgent(agent)] : [])
    }
    const { items } = this.agentService.listByUser('', 0, 50)
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
