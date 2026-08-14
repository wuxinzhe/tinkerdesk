/**
 * user-custom-model-service.ts — 用户自定义模型服务层
 *
 * IUserCustomModelService / UserCustomModelService（本地单用户版）：
 * list / create / update / delete / findById / test。
 * DTO 定义集中在 ./types.ts（对齐 dto/model/CustomModelInfoDTO 等）。
 */
import {CustomModelRepository} from '../repository/custom-model-repository'
import {SystemProviderRepository} from '../repository/system-provider-repository'
import type {CustomModelEntity} from '../repository/types'
import type {
  CreateCustomModelRequestDTO,
  CustomModelInfoDTO,
  CustomModelTestResultDTO,
  UpdateCustomModelRequestDTO,
} from './types'

/** 模型实体 → 模型 DTO */
export function toCustomModelInfoDTO(entity: CustomModelEntity): CustomModelInfoDTO {
  return {
    id: entity.id,
    alias: entity.alias,
    modelName: entity.modelName,
    providerId: entity.providerId,
    apiKey: entity.apiKey,
    baseUrl: entity.baseUrl,
    contextLimit: entity.contextLimit,
    modelType: entity.modelType,
    enabled: entity.enabled,
    testPassed: entity.testPassed,
    createdAt: entity.createdAt,
  }
}

/** 用户自定义模型服务 */
export class UserCustomModelService {
  constructor(
    private readonly repo: typeof CustomModelRepository,
    private readonly providerRepo: SystemProviderRepository
  ) { }

  /** 查询全部自定义模型（对齐 list） */
  list(_profile: string): CustomModelInfoDTO[] {
    return this.repo.listEnabled().map(toCustomModelInfoDTO)
  }

  /** 创建（对齐 create，返回新模型 ID） */
  create(profile: string, req: CreateCustomModelRequestDTO): string {
    if (!req.alias || !req.modelName || !req.providerId) {
      throw new Error('alias、modelName、providerId 必填')
    }
    const entity = this.repo.create({
      alias: req.alias,
      modelName: req.modelName,
      providerId: req.providerId,
      apiKey: req.apiKey ?? '',
      baseUrl: this.resolveBaseUrl(req.providerId, req.baseUrl),
      contextLimit: req.contextLimit,
      modelType: req.modelType,
      profile,
    })
    return String(entity.id)
  }

  /**
   * 解析 baseUrl：未填写（null/空）→ 从 system_providers 预设值兜底；
   * 否则按用户填写值（对齐 fetch-models 的默认 baseUrl 语义，保证模型可直达）。
   */
  private resolveBaseUrl(providerId: string, baseUrl?: string | null): string {
    if (baseUrl && baseUrl.trim()) {
      return baseUrl.trim()
    }
    const provider = this.providerRepo.findById(providerId)
    return provider?.baseUrl ?? ''
  }

  /** 更新（对齐 update；baseUrl 无论是否填写都走 resolveBaseUrl——空值用预设 provider 兜底，防旧数据/清空产生脏值） */
  update(profile: string, req: UpdateCustomModelRequestDTO): boolean {
    return this.repo.update(req.id, {
      alias: req.alias,
      modelName: req.modelName,
      providerId: req.providerId,
      apiKey: req.apiKey ?? undefined,
      baseUrl: this.resolveBaseUrl(req.providerId ?? '', req.baseUrl),
      contextLimit: req.contextLimit,
    })
  }

  /** 删除（对齐 delete） */
  delete(profile: string, modelId: string): boolean {
    return this.repo.delete(modelId)
  }

  /** 按 ID 查找（对齐 findById，返回 DTO） */
  findById(profile: string, id: string): CustomModelInfoDTO | null {
    const entity = this.repo.findById(id)
    return entity ? toCustomModelInfoDTO(entity) : null
  }

  /** 连通性测试（对齐 test，本地简化：ping 供应商 baseUrl） */
  async test(profile: string, modelId: string): Promise<CustomModelTestResultDTO> {
    const entity = this.repo.findById(modelId)
    if (!entity) {
      return {success: false, latencyMs: 0, message: '模型不存在'}
    }
    const provider = this.providerRepo.findById(entity.providerId)
    const baseUrl = entity.baseUrl ?? provider?.baseUrl
    if (!baseUrl) {
      return {success: false, latencyMs: 0, message: '未配置 baseUrl'}
    }
    const start = Date.now()
    try {
      // 本地连通性检查：HTTP HEAD（超时 5s）
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      await fetch(baseUrl, {method: 'HEAD', signal: controller.signal})
      clearTimeout(timer)
      this.repo.updateTestPassed(modelId, true)
      return {success: true, latencyMs: Date.now() - start, message: '连通'}
    } catch {
      this.repo.updateTestPassed(modelId, false)
      return {success: false, latencyMs: Date.now() - start, message: '连接失败'}
    }
  }
}
