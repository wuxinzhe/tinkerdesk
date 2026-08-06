/**
 * models.api.ts — 数据层
 * 模型管理 API（本地 IPC，走 ModelController）
 * 供应商 / 自定义模型 / 场景绑定
 *
 * profile 铁律：本地单用户但可多 Agent——自定义模型/场景绑定按 profile 隔离，
 * 所有 per-agent 方法必须传 profile（调用方从当前 Agent 上下文取）。
 */
import type { SystemProvider, ModelInfo, CustomModelInfo, SceneModelDetail, CreateCustomModelRequest } from '@/renderer/api/types'
import type { CustomModelTestResult, UpdateSceneModelRequest, BindSceneModelRequest, ReorderSceneBindingsRequest, UpdateCustomModelParams } from '@/renderer/api/types'
import '@/renderer/api/types'

export type { CustomModelTestResult, UpdateSceneModelRequest, BindSceneModelRequest, ReorderSceneBindingsRequest, UpdateCustomModelParams } from '@/renderer/api/types'

export class ModelsApi {
  // ── 供应商（全局，无 profile）──
  async listProviders(): Promise<SystemProvider[]> {
    const data = await window.api.models.listProviders()
    return (data as SystemProvider[]) ?? []
  }

  async getProvider(id: string): Promise<SystemProvider> {
    return (await window.api.models.getProvider(id)) as SystemProvider
  }

  /** 从供应商拉取可用模型列表（对齐 Java POST /models/providers/{id}/models） */
  async fetchModels(providerId: string, apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
    const data = await window.api.models.fetchModels({ providerId, apiKey, baseUrl })
    return data as ModelInfo[]
  }

  // ── 自定义模型（按 profile 限定）──
  async listCustomModels(profile: string): Promise<CustomModelInfo[]> {
    const data = await window.api.models.list(profile)
    return (data as CustomModelInfo[]) ?? []
  }

  async createCustomModel(profile: string, data: CreateCustomModelRequest): Promise<{ id: string }> {
    return (await window.api.models.create(profile, data)) as { id: string }
  }

  async updateCustomModel(profile: string, id: string, data: Omit<UpdateCustomModelParams, 'id'>): Promise<void> {
    await window.api.models.update(profile, { id, ...data })
  }

  async deleteCustomModel(profile: string, id: string): Promise<void> {
    await window.api.models.delete(profile, id)
  }

  async testCustomModel(profile: string, id: string): Promise<CustomModelTestResult | null> {
    const data = await window.api.models.test(profile, id)
    return (data as CustomModelTestResult) ?? null
  }

  // ── 场景模型绑定（按 profile 限定）──
  async listSceneModels(profile: string): Promise<SceneModelDetail[]> {
    const data = await window.api.models.listScenes(profile)
    return (data as SceneModelDetail[]) ?? []
  }

  async updateSceneModel(profile: string, data: UpdateSceneModelRequest): Promise<void> {
    await window.api.models.updateScene(profile, { sceneId: data.sceneId, modelId: data.modelId ?? '' })
  }

  async bindSceneModel(profile: string, data: BindSceneModelRequest): Promise<void> {
    await window.api.models.bindScene(profile, { sceneId: data.sceneId, modelId: data.modelId, priority: data.priority })
  }

  async unbindSceneModel(profile: string, sceneId: string, priority: number): Promise<void> {
    await window.api.models.unbindScene(profile, sceneId, priority)
  }

  async reorderSceneBindings(_profile: string, _data: ReorderSceneBindingsRequest): Promise<void> {
    // 本地无重排需求（场景绑定按 upsert 覆盖）
  }
}

/** 默认实例 */
export const modelsApi = new ModelsApi()
