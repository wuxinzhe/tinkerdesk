/**
 * scene-model-service.ts — 场景模型绑定服务层
 *
 * 多模型语义（v2）：
 * - 一个场景可绑定多个模型（主模型 is_main=1 + 备用 priority 顺序）
 * - updateSceneModel = 设置主模型（不再替换整组）
 * - 解绑按 model_id（主对话场景至少保留 1 个由调用方/controller 校验）
 * - 获取顺序：主模型 → 备用（priority 升序）→ 场景无绑定 → 主对话场景主模型（resolveForScene）
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

  /** 查询 profile 下全部场景的完整模型配置（场景全量来自 LlmOperationManager；未绑定场景 bindings 为空） */
  listSceneModels(profile: string): SceneModelDetailDTO[] {
    const scenes = this.operationManager?.listScenes() ?? []
    const bindings = this.sceneModelRepo.findAllWithProviderDetails(profile)
    const byScene = new Map<string, SceneModelBinding[]>()
    for (const b of bindings) {
      const list = byScene.get(b.sceneId) ?? []
      list.push(b)
      byScene.set(b.sceneId, list)
    }
    return scenes.map((s) => ({
      sceneId: s.scene,
      sceneName: s.name,
      bindings: (byScene.get(s.scene) ?? [])
        .sort((a, b) => (b.isMain ? 1 : 0) - (a.isMain ? 1 : 0) || a.priority - b.priority)
        .map((b): SceneBindingDTO => ({
          sceneId: b.sceneId,
          priority: b.priority,
          modelId: b.modelId,
          modelAlias: b.modelAlias ?? '',
          modelName: b.modelName ?? '',
          isMain: b.isMain ?? false,
        })),
    }))
  }

  /** 查询单个场景的绑定列表（主模型优先 + 备用按优先级升序） */
  listByScene(profile: string, sceneId: string): UserSceneModelEntity[] {
    return this.sceneModelRepo.findByUserAndSceneAll(profile, sceneId)
  }

  /** 设置主模型（多模型语义——不替换整组；modelId 为空 = 解绑主模型标记） */
  updateSceneModel(profile: string, req: UpdateSceneModelRequestDTO): void {
    if (!req.modelId) {
      const main = this.sceneModelRepo.findByUserAndScene(profile, req.sceneId)
      if (main) this.sceneModelRepo.deleteModel(profile, req.sceneId, main.modelId)
      return
    }
    this.sceneModelRepo.setMain(profile, req.sceneId, req.modelId)
  }

  /** 绑定场景模型（多模型——isMain=true 设为主模型；priority 留空自动分配备用顺序） */
  bindSceneModel(profile: string, req: BindSceneModelRequestDTO): void {
    this.sceneModelRepo.bind(profile, req.sceneId, req.modelId, Boolean(req.isMain), req.priority)
  }

  /** 解绑场景模型（按模型 id） */
  unbindSceneModel(profile: string, sceneId: string, modelId: string): void {
    this.sceneModelRepo.deleteModel(profile, sceneId, modelId)
  }

  /** 追加备用绑定（自动分配下一个优先级；is_main=0） */
  appendBinding(profile: string, sceneId: string, modelId: string): number {
    return this.sceneModelRepo.bind(profile, sceneId, modelId, false)
  }

  /** 重排绑定顺序（is_main 不变——只调备用优先级） */
  reorderSceneBindings(profile: string, req: ReorderSceneBindingsRequestDTO): void {
    this.sceneModelRepo.reorder(profile, req.sceneId, req.modelIds ?? [])
  }

  /** 设置主模型（显式——清场景其他主标记） */
  setMainModel(profile: string, sceneId: string, modelId: string): void {
    this.sceneModelRepo.setMain(profile, sceneId, modelId)
  }

  /** 主对话场景是否已配置 */
  isMainConversationConfigured(profile: string): boolean {
    return this.sceneModelRepo.isMainConversationConfigured(profile)
  }
}
