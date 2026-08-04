/**
 * prompt-modules-api.ts — 提示词模块 API
 */
import { HttpClient, http as defaultHttp } from './http-client'
import type { PromptModuleData } from '@/defines/models/prompt-module'

export type { PromptModuleData }

export class PromptModulesApi {
  constructor(private http: HttpClient) {}

  async list(profile: string): Promise<PromptModuleData[]> {
    const res = await this.http.get<PromptModuleData[]>('/prompt-modules', { params: { profile } })
    return res.data ?? []
  }

  async create(profile: string, name: string, content: string): Promise<PromptModuleData> {
    const res = await this.http.post<PromptModuleData>('/prompt-modules', { name, content }, { params: { profile } })
    return res.data!
  }

  async update(id: number, name: string, content: string): Promise<PromptModuleData> {
    const res = await this.http.put<PromptModuleData>(`/prompt-modules/${id}`, { name, content })
    return res.data!
  }

  async delete(id: number, profile: string): Promise<void> {
    await this.http.del(`/prompt-modules/${id}`, { params: { profile } })
  }

  async toggle(id: number, profile: string, enabled: boolean): Promise<void> {
    await this.http.patch(`/prompt-modules/${id}/toggle`, { enabled }, { params: { profile } })
  }
}

export const promptModulesApi = new PromptModulesApi(defaultHttp)
