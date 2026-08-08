/**
 * model-config-service.ts — 模型配置解析服务层
 *
 * 封装 custom_models + providers → ModelConfig[] 的组装逻辑
 * （原 bootstrap 闭包 resolveModelConfigs 的正式归属）。
 * TinkerAgent 注入本服务，按 profile 解析候选模型配置。
 */
import { CustomModelRepository } from '../repository/custom-model-repository'
import { ProviderRepository } from '../repository/providers-repository'
import { UserSceneModelRepository } from '../repository/user-scene-model-repository'
import { apiModeFromString, createModelConfig } from '../core/llm'
import type { ModelConfig } from '../core/llm/types'
import { SCENE_CHAT } from '../core/llm/types'

/** 模型配置解析服务 */
export class ModelConfigService {
  constructor(
    private readonly customModelRepo: typeof CustomModelRepository,
    private readonly providerRepo: typeof ProviderRepository,
    private readonly sceneModelRepo: UserSceneModelRepository
  ) {}

  /** 解析 profile 下全部启用的自定义模型 → ModelConfig[]（主对话场景绑定优先——主模型在前） */
  resolveAll(profile: string): ModelConfig[] {
    const models = this.customModelRepo.listEnabled()
    // 主对话场景绑定的模型优先（用户配置的"主模型"）：
    // listEnabled 按 created_at DESC——后创建的"备用模型"反而排第一，主模型成了备选
    const bound = this.sceneModelRepo.findByUserAndSceneAll(profile, SCENE_CHAT)
    if (bound.length > 0) {
      const boundIds = bound.map((b) => b.modelId)
      const sorted = [...models].sort((a, b) => {
        const ia = boundIds.indexOf(a.id)
        const ib = boundIds.indexOf(b.id)
        if (ia >= 0 && ib >= 0) return ia - ib
        if (ia >= 0) return -1
        if (ib >= 0) return 1
        return 0
      })
      return sorted.map((m) => this.toConfig(m))
    }
    return models.map((m) => this.toConfig(m))
  }

  /**
   * 按场景解析模型配置（多模型语义）：
   * 1. 场景绑定：主模型（is_main=1）排第一 → 备用（priority 升序）
   * 2. 场景无绑定 → 主对话场景（SCENE_CHAT）的主模型
   * 3. 都没有 → 全部启用的自定义模型
   * 主模型请求失败时 llm-router 按数组顺序自动回退到备用模型。
   */
  resolveForScene(profile: string, sceneId: string): ModelConfig[] {
    const sceneModels = this.sceneModelRepo.findByUserAndSceneAll(profile, sceneId)
    if (sceneModels.length > 0) {
      return sceneModels
        .map((b) => this.customModelRepo.findById(b.modelId))
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .map((m) => this.toConfig(m))
    }
    // 场景无绑定 → 主对话场景主模型（若无绑定则回退全部模型）
    const main = this.sceneModelRepo.findByUserAndScene(profile, SCENE_CHAT)
    if (main) {
      const m = this.customModelRepo.findById(main.modelId)
      if (m) return [this.toConfig(m)]
    }
    return this.resolveAll(profile)
  }

  private toConfig(m: { id: string; modelName: string; apiKey: string; baseUrl?: string; providerId: string; contextLimit: number }): ModelConfig {
    const provider = this.providerRepo.findById(m.providerId)
    const apiMode = provider ? apiModeFromString(provider.apiMode) : 'openai'
    return createModelConfig(
      m.modelName,
      m.apiKey,
      m.baseUrl || provider?.baseUrl || '',
      m.contextLimit,
      apiMode
    )
  }
}
