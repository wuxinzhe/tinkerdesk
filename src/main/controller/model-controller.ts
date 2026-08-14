/**
 * model-controller.ts — 模型管理 IPC controller（class 形式）
 *
 * ModelController (local single-user, no userId):
 * - request params wrapped as RequestDTO
 * - return types concretized, never unknown
 * - constructor-injected service, register() binds all channels
 *
 * Profile rule: local single-user but multi-Agent — scene_models (scene
 * bindings) are isolated per profile; custom_models (connected models)
 * are shared globally (visible to all agents; queries/CRUD are not
 * profile-filtered).
 * All per-agent methods require profile (passed by the renderer; main never
 * hardcodes a default). system_providers / fetch-models are global or
 * stateless operations and carry no profile.
 *
 * Structure: register() only binds ipcMain.handle; logic lives in
 * named methods with fully typed params/returns.
 * IPC prefix: model:*
 */

import { handleTrusted } from '../security/ipc-guard'
import { SCENE_CHAT } from '../core/llm/types'
import type { UserCustomModelService } from '../service/user-custom-model-service'
import type { SceneModelService } from '../service/scene-model-service'
import type { SystemProviderService } from '../service/system-provider-service'
import type {
  BindSceneModelRequestDTO,
  CreateCustomModelRequestDTO,
  CustomModelInfoDTO,
  CustomModelTestResultDTO,
  FetchModelsRequestDTO,
  ModelInfoDTO,
  ReorderSceneBindingsRequestDTO,
  SceneModelDetailDTO,
  UpdateCustomModelRequestDTO,
  UpdateSceneModelRequestDTO,
} from '../service/types'
import { fetchModels } from '../service/model-api-client'
import type { SystemProviderEntity } from '../repository/types'
import { ok, fail } from './api-response'
import type { ApiResponse } from './api-response'

/** 模型管理 controller */
export class ModelController {
  constructor(
    private readonly customModelService: UserCustomModelService,
    private readonly sceneModelService: SceneModelService,
    private readonly providerService: SystemProviderService
  ) { }

  /** 注册全部 IPC handler（只做绑定，逻辑在独立具名方法） */
  register(): void {
    // ── 自定义模型 CRUD（profile 必传）──
    handleTrusted('model:list', (_event, payload) => this.listCustomModels(payload))
    handleTrusted('model:get', (_event, payload) => this.getCustomModel(payload))
    handleTrusted('model:create', (_event, payload) => this.createCustomModel(payload))
    handleTrusted('model:update', (_event, payload) => this.updateCustomModel(payload))
    handleTrusted('model:delete', (_event, payload) => this.deleteCustomModel(payload))
    handleTrusted('model:test', (_event, payload) => this.testCustomModel(payload))
    // ── 系统供应商（全局，无 profile）──
    handleTrusted('model:list-providers', () => this.listProviders())
    handleTrusted('model:get-provider', (_event, id) => this.getProvider(id))
    handleTrusted('model:fetch-models', (_event, input) => this.fetchProviderModels(input))
    // ── 场景模型绑定（profile 必传）──
    handleTrusted('model:list-scenes', (_event, payload) => this.listSceneBindings(payload))
    handleTrusted('model:bind-scene', (_event, payload) => this.bindSceneModel(payload))
    handleTrusted('model:update-scene', (_event, payload) => this.updateSceneBinding(payload))
    handleTrusted('model:reorder-scenes', (_event, payload) => this.reorderSceneBindings(payload))
    handleTrusted('model:unbind-scene', (_event, payload) => this.unbindSceneModel(payload))
  }

  // ══════════════════════════════════════════════════════════════
  // 各 IPC 方法（具名方法 + 完整入参出参类型）
  // ══════════════════════════════════════════════════════════════

  /** 查询自定义模型列表（按 profile 限定） */
  private listCustomModels(payload: { profile: string }): ApiResponse<CustomModelInfoDTO[]> {
    try {
      if (!payload?.profile) {
        return fail('profile 不能为空')
      }
      return ok(this.customModelService.list(payload.profile))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 查询自定义模型详情（按 profile 限定） */
  private getCustomModel(payload: { profile: string; id: string }): ApiResponse<CustomModelInfoDTO> {
    try {
      if (!payload?.profile) {
        return fail('profile 不能为空')
      }
      const model = this.customModelService.findById(payload.profile, payload.id)
      return model ? ok(model) : fail('模型不存在')
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 创建自定义模型（按 profile 限定） */
  private createCustomModel(payload: { profile: string } & CreateCustomModelRequestDTO): ApiResponse<{ id: string }> {
    try {
      if (!payload?.profile) {
        return fail('profile 不能为空')
      }
      if (!payload.alias || !payload.modelName || !payload.providerId) {
        return fail('alias、modelName、providerId 必填')
      }
      const id = this.customModelService.create(payload.profile, payload)
      return ok({ id })
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 更新自定义模型（按 profile 限定） */
  private updateCustomModel(payload: { profile: string } & UpdateCustomModelRequestDTO): ApiResponse<null> {
    try {
      if (!payload?.profile) {
        return fail('profile 不能为空')
      }
      const updated = this.customModelService.update(payload.profile, payload)
      return updated ? ok(null) : fail('模型不存在')
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 删除自定义模型（按 profile 限定） */
  private deleteCustomModel(payload: { profile: string; id: string }): ApiResponse<null> {
    try {
      if (!payload?.profile) {
        return fail('profile 不能为空')
      }
      const deleted = this.customModelService.delete(payload.profile, payload.id)
      return deleted ? ok(null) : fail('模型不存在')
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 测试自定义模型连接（按 profile 限定） */
  private async testCustomModel(payload: { profile: string; id: string }): Promise<ApiResponse<CustomModelTestResultDTO>> {
    try {
      if (!payload?.profile) {
        return fail('profile 不能为空')
      }
      return ok(await this.customModelService.test(payload.profile, payload.id))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 查询系统供应商列表（全局） */
  private listProviders(): ApiResponse<SystemProviderEntity[]> {
    try {
      return ok(this.providerService.findAll())
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 查询系统供应商详情（全局） */
  private getProvider(id: string): ApiResponse<SystemProviderEntity> {
    try {
      const provider = this.providerService.findById(id)
      return provider ? ok(provider) : fail('供应商不存在')
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 从供应商拉取可用模型列表 */
  private async fetchProviderModels(input: FetchModelsRequestDTO): Promise<ApiResponse<ModelInfoDTO[]>> {
    try {
      if (!input?.providerId) {
        return fail('providerId 必填')
      }
      const provider = this.providerService.findById(input.providerId)
      if (!provider) {
        return fail(`供应商 '${input.providerId}' 不存在`)
      }
      // baseUrl 优先用请求中的，其次用供应商模板默认值
      const baseUrl = (input.baseUrl && input.baseUrl.trim() !== '') ? input.baseUrl.trim() : provider.baseUrl
      if (!baseUrl) {
        return fail('该供应商没有默认 endpoint，请提供 baseUrl')
      }
      const models = await fetchModels(baseUrl, input.apiKey ?? '')
      return ok(models)
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 查询场景模型绑定列表（按 profile 限定） */
  private listSceneBindings(payload: { profile: string }): ApiResponse<SceneModelDetailDTO[]> {
    try {
      if (!payload?.profile) {
        return fail('profile 不能为空')
      }
      return ok(this.sceneModelService.listSceneModels(payload.profile))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 绑定场景模型（按 profile 限定） */
  private bindSceneModel(payload: { profile: string } & BindSceneModelRequestDTO): ApiResponse<null> {
    try {
      if (!payload?.profile) {
        return fail('profile 不能为空')
      }
      if (!payload.sceneId || !payload.modelId) {
        return fail('sceneId 和 modelId 必填')
      }
      this.sceneModelService.bindSceneModel(payload.profile, payload)
      return ok(null)
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 更新场景绑定（改优先级/模型，按 profile 限定） */
  private updateSceneBinding(payload: { profile: string } & UpdateSceneModelRequestDTO): ApiResponse<null> {
    try {
      if (!payload?.profile) {
        return fail('profile 不能为空')
      }
      if (!payload.sceneId) {
        return fail('sceneId 必填')
      }
      this.sceneModelService.updateSceneModel(payload.profile, payload)
      return ok(null)
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 重排场景绑定优先级（按 profile 限定） */
  private reorderSceneBindings(payload: { profile: string } & ReorderSceneBindingsRequestDTO): ApiResponse<null> {
    try {
      if (!payload?.profile) {
        return fail('profile 不能为空')
      }
      if (!payload.sceneId || !Array.isArray(payload.priorities)) {
        return fail('sceneId 和 priorities 必填')
      }
      this.sceneModelService.reorderSceneBindings(payload.profile, payload)
      return ok(null)
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 解绑场景模型（按 model id——主对话场景至少保留 1 个由本方法校验） */
  private unbindSceneModel(payload: { profile: string; sceneId: string; modelId: string }): ApiResponse<null> {
    try {
      if (!payload?.profile) {
        return fail('profile 不能为空')
      }
      if (!payload.sceneId || !payload.modelId) {
        return fail('sceneId 和 modelId 必填')
      }
      // 删除校验：主对话场景至少保留 1 个模型
      if (payload.sceneId === SCENE_CHAT && this.sceneModelService.listByScene(payload.profile, SCENE_CHAT).length <= 1) {
        return fail('主对话场景至少需要保留 1 个模型')
      }
      this.sceneModelService.unbindSceneModel(payload.profile, payload.sceneId, payload.modelId)
      return ok(null)
    } catch (e) {
      return fail((e as Error).message)
    }
  }
}
