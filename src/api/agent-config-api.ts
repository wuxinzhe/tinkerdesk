/**
 * agent-config-api.ts — Agent 配置 API
 */
import { HttpClient, http as defaultHttp } from './http-client'
import type { AgentConfigData } from '@/defines/models/agent-config'

export type { AgentConfigData }

export class AgentConfigApi {
  constructor(private http: HttpClient) {}

  async get(profile: string): Promise<AgentConfigData> {
    const res = await this.http.get<AgentConfigData>('/agent-config', { params: { profile } })
    // 后端 /agent-config 返回扁平 JSON（非 ApiResponse 包装），
    // res.data 为 undefined，直接使用 res 本身
    const raw = res as unknown as AgentConfigData
    return raw ?? {} as AgentConfigData
  }

  async update(profile: string, config: AgentConfigData): Promise<void> {
    await this.http.put('/agent-config', config, { params: { profile } })
  }

  async reset(profile: string): Promise<AgentConfigData> {
    const res = await this.http.post<AgentConfigData>('/agent-config/reset', {}, { params: { profile } })
    const raw = res as unknown as AgentConfigData
    return raw ?? {} as AgentConfigData
  }
}

export const agentConfigApi = new AgentConfigApi(defaultHttp)
