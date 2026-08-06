/**
 * scene-model-service.ts — 场景模型绑定服务层
 *
 * 复刻 tinker-agent ISceneModelService（本地单用户版，去 userId）：
 * 场景模型列表（含详情）、绑定/解绑、重排优先级。
 * DTO 定义集中在 ./types.ts（对齐 dto/model/SceneModelDetailDTO 等）。
 */
import type { SceneModelBinding, UserSceneModelEntity } from '../repository/types'
import { UserSceneModelRepository } from '../repository/user-scene-model-repository'
import type { LlmOperationManager } from '../core/llm/llm-operation-manager'
import type { BindSceneModelRequestDTO, ReorderSceneBindingsRequestDTO, SceneBindingDTO, SceneModelDetailDTO, UpdateSceneModelRequestDTO } from './types'

/** 场景模型服务 */
export class SceneModelService {
  constructor(
    private readonly sceneModelRepo: UserSceneModelRepository,
    private readonly operationManager?: LlmOperationManager
  ) { }

  /**
   * 查询 profile 下全部场景的完整模型配置（对齐 listSceneModels → SceneModelDetailDTO[]）。
   * 场景全量来自代码注册的 LlmOperationManager（非数据库表维护）；未绑定模型的场景 bindings 为空数组。
   */
  listSceneModels(profile: string): SceneModelDetailDTO[] {
    const scenes = this.operationManager?.listScenes() ?? []
    // 全部绑定（含模型/供应商详情）
    const bindings = this.sceneModelRepo.findAllWithProviderDetails(profile)
    // 按场景分组
    const byScene = new Map<string, SceneModelBinding[]>()
    for (const b of bindings) {
      const list = byScene.get(b.sceneId) ?? []
      list.push(b)
      byScene.set(b.sceneId, list)
    }
    // 全量场景遍历 → SceneModelDetailDTO（未绑定场景 bindings: []）
    return scenes.map((s) => ({
      sceneId: s.scene,
      sceneName: s.name,
      bindings: (byScene.get(s.scene) ?? [])
        .sort((a, b) => a.priority - b.priority)
        .map((b): SceneBindingDTO => ({
          sceneId: b.sceneId,
          priority: b.priority,
          modelId: b.modelId,
          modelAlias: b.modelAlias ?? '',
          modelName: b.modelName ?? '',
        })),
    }))
  }

  /** 查询单个场景的绑定列表（按优先级升序） */
  listByScene(profile: string, sceneId: string): UserSceneModelEntity[] {
    return this.sceneModelRepo.findByUserAndSceneAll(profile, sceneId)
  }

  /** 传统单模型绑定（priority=0，modelId=null 解绑；对齐 updateSceneModel） */
  updateSceneModel(profile: string, req: UpdateSceneModelRequestDTO): void {
    if (!req.modelId) {
      this.sceneModelRepo.delete(profile, req.sceneId)
      return
    }
    this.sceneModelRepo.upsert(profile, req.sceneId, req.modelId)
  }

  /** 绑定场景模型（priority 留空自动分配；对齐 bindSceneModel） */
  bindSceneModel(profile: string, req: BindSceneModelRequestDTO): void {
    if (req.priority !== undefined && req.priority > 0) {
      this.sceneModelRepo.upsertWithPriority(profile, req.sceneId, req.modelId, req.priority)
    } else {
      this.sceneModelRepo.upsert(profile, req.sceneId, req.modelId)
    }
  }

  /** 解绑场景模型（按场景+优先级） */
  unbindSceneModel(profile: string, sceneId: string, priority: number): void {
    if (priority === 0) {
      this.sceneModelRepo.delete(profile, sceneId)
    } else {
      this.sceneModelRepo.deleteWithPriority(profile, sceneId, priority)
    }
  }

  /** 追加绑定（分配下一个优先级） */
  appendBinding(profile: string, sceneId: string, modelId: string): number {
    const next = this.sceneModelRepo.findMaxPriority(profile, sceneId) + 1
    this.sceneModelRepo.upsertWithPriority(profile, sceneId, modelId, next)
    return next
  }

  /** 重排绑定顺序（对齐 reorderSceneBindings） */
  reorderSceneBindings(profile: string, req: ReorderSceneBindingsRequestDTO): void {
    const existing = this.sceneModelRepo.findByUserAndSceneAll(profile, req.sceneId)
    // 按新优先级顺序重排：priorities[i] 对应第 i 个已有绑定的模型
    const count = Math.min(existing.length, req.priorities.length)
    for (let i = 0; i < count; i++) {
      this.sceneModelRepo.upsertWithPriority(profile, req.sceneId, existing[i].modelId, req.priorities[i])
    }
  }

  /** 主对话场景是否已配置 */
  isMainConversationConfigured(profile: string): boolean {
    return this.sceneModelRepo.countConfiguredForMainConversation(profile) > 0
  }
}
