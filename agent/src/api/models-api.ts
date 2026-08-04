/**
 * models.api.ts — 数据层
 * 模型管理 API（供应商、自定义模型、场景绑定）
 */
import { HttpClient, http as defaultHttp } from './http-client'
import type { SystemProvider, ModelInfo, CustomModelInfo, SceneModelDetail, CreateCustomModelRequest } from '@/defines/models/model'
import type { CustomModelTestResult, UpdateSceneModelRequest, BindSceneModelRequest, ReorderSceneBindingsRequest, UpdateCustomModelParams } from '@/defines/api/model-types'

export class ModelsApi {
  constructor(private http: HttpClient) {}

  // ── 供应商 ──
  async listProviders(): Promise<SystemProvider[]> {
    const res = await this.http.get<SystemProvider[]>('/models/providers')
    return res.data ?? []
  }

  async getProvider(id: string): Promise<SystemProvider> {
    const res = await this.http.get<SystemProvider>(`/models/providers/${id}`)
    return res.data!
  }

  async fetchModels(providerId: string, apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
    const res = await this.http.post<ModelInfo[]>(`/models/providers/${providerId}/models`, { apiKey, baseUrl })
    return res.data ?? []
  }

  // ── 自定义模型 ──
  async listCustomModels(): Promise<CustomModelInfo[]> {
    const res = await this.http.get<CustomModelInfo[]>('/models/custom')
    return res.data ?? []
  }

  async createCustomModel(data: CreateCustomModelRequest): Promise<{ id: string }> {
    const res = await this.http.post<{ id: string }>('/models/custom', data)
    return res.data!
  }

  async updateCustomModel(id: string, data: UpdateCustomModelParams): Promise<void> {
    await this.http.put(`/models/custom/${id}`, data)
  }

  async deleteCustomModel(id: string): Promise<void> {
    await this.http.del(`/models/custom/${id}`)
  }

  async testCustomModel(id: string): Promise<CustomModelTestResult | null> {
    const res = await this.http.post<CustomModelTestResult>(`/models/custom/${id}/test`)
    return res.data ?? null
  }

  // ── 场景模型绑定 ──
  async listSceneModels(profile: string): Promise<SceneModelDetail[]> {
    const res = await this.http.get<SceneModelDetail[]>('/models/scenes', { params: { profile } })
    return res.data ?? []
  }

  async updateSceneModel(data: UpdateSceneModelRequest): Promise<void> {
    await this.http.put('/models/scenes', data)
  }

  async bindSceneModel(data: BindSceneModelRequest): Promise<void> {
    await this.http.post('/models/scenes/bind', data)
  }

  async unbindSceneModel(sceneId: string, priority: number, profile: string): Promise<void> {
    await this.http.del(`/models/scenes/${sceneId}/bind/${priority}`, { params: { profile } })
  }

  async reorderSceneBindings(data: ReorderSceneBindingsRequest): Promise<void> {
    await this.http.post('/models/scenes/reorder', data)
  }
}

/** 默认实例 */
export const modelsApi = new ModelsApi(defaultHttp)


