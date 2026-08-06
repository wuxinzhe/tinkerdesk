/**
 * model-config-service.ts — 模型配置解析服务层
 *
 * 封装 custom_models + providers → ModelConfig[] 的组装逻辑
 * （原 bootstrap 闭包 resolveModelConfigs 的正式归属）。
 * AgentLoop 注入本服务，按 profile 解析候选模型配置。
 */
import { CustomModelRepository } from '../repository/custom-model-repository'
import { ProviderRepository } from '../repository/providers-repository'
import { apiModeFromString, createModelConfig } from '../core/llm'
import type { ModelConfig } from '../core/llm/types'

/** 模型配置解析服务 */
export class ModelConfigService {
  constructor(
    private readonly customModelRepo: typeof CustomModelRepository,
    private readonly providerRepo: typeof ProviderRepository
  ) {}

  /** 解析 profile 下全部启用的自定义模型 → ModelConfig[] */
  resolveAll(profile: string): ModelConfig[] {
    const models = this.customModelRepo.listEnabled(profile)
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
