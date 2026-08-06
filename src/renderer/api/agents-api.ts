/**
 * agents.api.ts — 数据层
 * Agent 配置 API（本地 IPC，走 AgentCrudController）
 */
import type { AgentInfo, CreateAgentRequest, UpdateAgentRequest, ModeInfo, ModeOptionVO } from '@/renderer/api/types'
import '@/renderer/api/types'

export class AgentsApi {
  async list(userId?: string): Promise<AgentInfo[]> {
    const data = await window.api.agents.list({ profile: userId })
    return (data as AgentInfo[]) ?? []
  }

  async get(profile: string): Promise<AgentInfo> {
    return (await window.api.agents.get(profile)) as AgentInfo
  }

  async create(req: CreateAgentRequest): Promise<AgentInfo> {
    return (await window.api.agents.create(req as unknown as { profile: string })) as AgentInfo
  }

  async update(profile: string, req: UpdateAgentRequest): Promise<AgentInfo> {
    return (await window.api.agents.update({ profile, ...req })) as AgentInfo
  }

  async delete(profile: string): Promise<void> {
    await window.api.agents.delete(profile)
  }

  /** 模式选项（前端下拉，对齐 GET /agent/mode/list?options=true） */
  async listModes(options = false): Promise<ModeOptionVO[] | ModeInfo[]> {
    if (options) {
      const data = await window.api.agentModes.options()
      return (data as ModeOptionVO[]) ?? []
    }
    const data = await window.api.agentModes.list()
    return (data as ModeInfo[]) ?? []
  }

  /** 按 id + version 查模式详情（对齐 GET /agent/mode/info/{key}） */
  async getMode(key: string): Promise<ModeInfo> {
    const [id, version] = key.includes('/') ? key.split('/') : [key, '1.0']
    return (await window.api.agentModes.get(id, version)) as ModeInfo
  }
}

/** 默认实例 */
export const agentsApi = new AgentsApi()
