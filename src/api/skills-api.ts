/**
 * skills.api.ts — 数据层
 * 技能管理 API
 */
import { HttpClient, http as defaultHttp } from './http-client'
import type { SkillInfo, SkillCategory } from '@/defines/models/skill'
import type { ApiResponse, PageResponse } from '@/defines/api/types'

export class SkillsApi {
  constructor(private http: HttpClient) {}

  async listOfficial(params?: {
    offset?: number
    limit?: number
    category?: string
    name?: string
    profile?: string
  }): Promise<PageResponse<SkillInfo>> {
    const res = await this.http.get<PageResponse<SkillInfo>>('/skills/official', { params })
    return res.data ?? { items: [], total: 0, offset: 0, limit: 0 }
  }

  async get(id: string): Promise<SkillInfo> {
    const res = await this.http.get<SkillInfo>(`/skills/${id}`)
    return res.data!
  }

  async categories(): Promise<SkillCategory[]> {
    const res = await this.http.get<SkillCategory[]>('/skills/categories/list')
    return res.data ?? []
  }

  async installed(params: {
    profile: string
    offset?: number
    limit?: number
    category?: string
    name?: string
  }): Promise<PageResponse<SkillInfo>> {
    const res = await this.http.get<PageResponse<SkillInfo>>('/skills/installed', { params })
    return res.data ?? { items: [], total: 0, offset: 0, limit: 0 }
  }

  async install(skillId: string, profile = 'default'): Promise<ApiResponse> {
    return await this.http.post(`/skills/${skillId}/install`, null, { params: { profile } })
  }

  async activate(skillId: string, profile = 'default'): Promise<ApiResponse> {
    return await this.http.post(`/skills/${skillId}/activate`, null, { params: { profile } })
  }

  async deactivate(skillId: string, profile = 'default'): Promise<ApiResponse> {
    return await this.http.post(`/skills/${skillId}/deactivate`, null, { params: { profile } })
  }

  async upload(file: File, category?: string): Promise<{ id: string }> {
    const form = new FormData()
    form.append('file', file)
    if (category) form.append('category', category)
    const res = await this.http.post<{ id: string }>('/admin/skills/import/upload', form)
    return res.data!
  }
}

/** 默认实例 */
export const skillsApi = new SkillsApi(defaultHttp)
