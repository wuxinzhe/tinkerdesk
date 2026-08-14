/**
 * service/agent-mode-service.ts — Agent Mode 服务层
 *
 * AgentModeService (local single-user):
 * - list: all registered mode metadata
 * - listOptions: mode options (renderer dropdown)
 * - get: lookup by id+version
 * - checkAgentMode：检查当前 agent 的模式配置是否有效
 */
import { AgentModeRegistry } from '../core/mode/agent-mode-registry'
import type { ModeInfoDTO, ModeOptionDTO } from '../core/mode/agent-mode'
import type { AgentService } from './agent-service'

/** Agent Mode 服务 */
export class AgentModeService {
  constructor(
    private readonly registry: AgentModeRegistry,
    private readonly agentService: AgentService
  ) {}

  /** 全部已注册模式（平铺） */
  list(): ModeInfoDTO[] {
    return this.registry.findAllActive()
  }

  /** 模式选项（前端下拉） */
  listOptions(): ModeOptionDTO[] {
    return this.registry.listOptions()
  }

  /** 按 id + version 查元数据 */
  get(id: string, version: string): ModeInfoDTO | null {
    return this.registry.findById(id, version)
  }

  /** 检查当前 agent 的模式配置 */
  checkAgentMode(profile: string): { ok: boolean; detail: string } {
    const agent = this.agentService.getAgentInfo(profile)
    if (!agent) {
      return { ok: false, detail: '主 Agent 不存在，无法检查 Agent Mode' }
    }
    const { agentModeId, agentModeVersion } = agent
    if (!agentModeId || !agentModeVersion) {
      return { ok: false, detail: `Agent Mode 未设置（agent_mode_id='${agentModeId}', version='${agentModeVersion}'）` }
    }
    const modeRef = `${agentModeId}/${agentModeVersion}`
    const exists = this.registry.existsVersion(agentModeId, agentModeVersion)
    return exists
      ? { ok: true, detail: `Agent Mode 已配置（${modeRef}）` }
      : { ok: false, detail: `Agent Mode 记录在注册表中不存在（${modeRef}）` }
  }
}
