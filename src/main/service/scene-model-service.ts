/**
 * scene-model-service.ts — 场景模型绑定服务层
 *
 * 复刻 showing-agent ISceneModelService（本地单用户版，去 userId）：
 * 场景模型列表（含详情）、绑定/解绑、重排优先级。
 */
import {UserSceneModelRepository} from '../repository/user-scene-model-repository'
import type {SceneModelBinding, UserSceneModelEntity} from '../repository/types'

/** 场景模型服务 */
export class SceneModelService {
  constructor(private readonly sceneModelRepo: UserSceneModelRepository) {}

  /** 查询 profile 下全部场景绑定（含模型/供应商详情） */
  listSceneModels(profile: string): SceneModelBinding[] {
    return this.sceneModelRepo.findAllWithProviderDetails(profile)
  }

  /** 查询单个场景的绑定列表（按优先级升序） */
  listByScene(profile: string, sceneId: string): UserSceneModelEntity[] {
    return this.sceneModelRepo.findByUserAndSceneAll(profile, sceneId)
  }

  /** 绑定场景主模型（priority=0，重复绑定覆盖） */
  bindSceneModel(profile: string, sceneId: string, modelId: string): void {
    this.sceneModelRepo.upsert(profile, sceneId, modelId)
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

  /** 重排绑定顺序（bindings: [{modelId, priority}]） */
  reorderSceneBindings(profile: string, sceneId: string, bindings: Array<{modelId: string; priority: number}>): void {
    for (const b of bindings) {
      this.sceneModelRepo.upsertWithPriority(profile, sceneId, b.modelId, b.priority)
    }
  }

  /** 主对话场景是否已配置 */
  isMainConversationConfigured(profile: string): boolean {
    return this.sceneModelRepo.countConfiguredForMainConversation(profile) > 0
  }
}
