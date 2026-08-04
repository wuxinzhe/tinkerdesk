/**
 * agents.api.ts — 数据层
 * Agent 管理 API
 */
import type { AgentInfo, CreateAgentRequest, ModeInfo, ModeOptionVO, UpdateAgentRequest } from '@/defines/models/agent'
import type { PageResponse } from '@/defines/api/types'
import { HttpClient, http as defaultHttp } from './http-client'

export class AgentsApi {
  constructor(private http: HttpClient) {}

  async list(userId?: string): Promise<AgentInfo[]> {
    const res = await this.http.get<PageResponse<AgentInfo>>('/agent/list')
    return res.data?.items ?? []
  }

  async get(profile: string): Promise<AgentInfo> {
    const res = await this.http.get<AgentInfo>(`/agent/${profile}`)
    return res.data!
  }

  async create(req: CreateAgentRequest): Promise<AgentInfo> {
    const res = await this.http.post<AgentInfo>('/agent', req)
    return res.data!
  }

  async update(profile: string, req: UpdateAgentRequest): Promise<AgentInfo> {
    const res = await this.http.put<AgentInfo>(`/agent/${profile}`, req)
    return res.data!
  }

  async delete(profile: string): Promise<void> {
    await this.http.del(`/agent/${profile}`)
  }

  async listModes(options = false): Promise<ModeOptionVO[] | ModeInfo[]> {
    const res = await this.http.get<ModeOptionVO[] | ModeInfo[]>('/agent/mode/list', { params: { options } })
    return res.data ?? []
  }

  async getMode(key: string): Promise<ModeInfo> {
    const res = await this.http.get<ModeInfo>(`/agent/mode/info/${key}`)
    return res.data!
  }
}

/** 默认实例 */
export const agentsApi = new AgentsApi(defaultHttp)
