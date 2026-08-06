/**
 * model-config-service.ts — 模型配置解析服务层
 *
 * 封装 custom_models + providers → ModelConfig[] 的组装逻辑
 * （原 bootstrap 闭包 resolveModelConfigs 的正式归属）。
 * AgentLoop 注入本服务，按 profile 解析候选模型配置。
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

  /** 解析 profile 下全部启用的自定义模型 → ModelConfig[]（主对话场景绑定的模型优先） */
  resolveAll(profile: string): ModelConfig[] {
    const models = this.customModelRepo.listEnabled(profile)
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
      return sorted.map((m) => {
        const provider = this.providerRepo.findById(m.providerId)
        const apiMode = provider ? apiModeFromString(provider.apiMode) : 'openai'
        return createModelConfig(
          m.modelName,
          m.apiKey,
          m.baseUrl || provider?.baseUrl || '',
          m.contextLimit,
          apiMode
        )
      })
    }
    return models.map((m) => {
      const provider = this.providerRepo.findById(m.providerId)
      const apiMode = provider ? apiModeFromString(provider.apiMode) : 'openai'
      return createModelConfig(
        m.modelName,
        m.apiKey,
        m.baseUrl || provider?.baseUrl || '',
        m.contextLimit,
        apiMode
      )
    })
  }
}
