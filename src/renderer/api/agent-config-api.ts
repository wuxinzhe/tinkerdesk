/**
 * agent-config.api.ts — 数据层
 * Agent 配置参数 API（本地 IPC，走 AgentConfigController）
 */
import type { AgentConfigData } from '@/renderer/api/types'
import '@/renderer/api/types'

export class AgentConfigApi {
  async get(profile: string): Promise<AgentConfigData> {
    return (await window.api.agentConfig.get(profile)) as AgentConfigData
  }

  async update(profile: string, config: AgentConfigData): Promise<void> {
    await window.api.agentConfig.update({ profile, config: config as unknown as Record<string, unknown> })
  }

  async reset(profile: string): Promise<AgentConfigData> {
    return (await window.api.agentConfig.reset(profile)) as AgentConfigData
  }
}

/** 默认实例 */
export const agentConfigApi = new AgentConfigApi()
