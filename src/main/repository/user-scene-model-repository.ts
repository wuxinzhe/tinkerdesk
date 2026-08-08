import { getDatabase } from './database'
import type { SceneModelBinding, UserSceneModelEntity } from './types'
import { SCENE_CHAT } from '../core/llm/types'

/**
 * 用户场景模型仓库
 *
 * 多模型语义（v2）：
 * - 一个场景可绑定多个模型（PK: profile+scene_id+model_id）
 * - is_main=1 表示该场景的主模型（一个场景内有且仅有一个）
 * - priority 为备用模型顺序（升序——DB 默认顺序）
 */
export class UserSceneModelRepository {
  /** 主对话场景是否已配置模型 */
  countConfiguredForMainConversation(profile: string): number {
    const db = getDatabase()
    const row = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM user_scene_models
         WHERE profile = ? AND scene_id = ?`
      )
      .get(profile, SCENE_CHAT) as { cnt: number }
    return row.cnt
  }

  /** 统计场景下绑定的模型数（删除校验用——主对话场景至少保留 1 个） */
  countByScene(profile: string, sceneId: string): number {
    const db = getDatabase()
    const row = db
      .prepare('SELECT COUNT(*) AS cnt FROM user_scene_models WHERE profile = ? AND scene_id = ?')
      .get(profile, sceneId) as { cnt: number }
    return row.cnt
  }

  /** 查询场景下的主模型（is_main=1） */
  findByUserAndScene(profile: string, sceneId: string): UserSceneModelEntity | null {
    const db = getDatabase()
    const row = db
      .prepare(
        `SELECT profile, scene_id, model_id, priority, is_main FROM user_scene_models
         WHERE profile = ? AND scene_id = ? AND is_main = 1`
      )
      .get(profile, sceneId) as Record<string, unknown> | undefined
    return row ? toEntity(row) : null
  }

  /** 查询场景下的全部绑定（主模型优先 + 备用按优先级升序） */
  findByUserAndSceneAll(profile: string, sceneId: string): UserSceneModelEntity[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT profile, scene_id, model_id, priority, is_main FROM user_scene_models
         WHERE profile = ? AND scene_id = ? ORDER BY is_main DESC, priority ASC`
      )
      .all(profile, sceneId) as Array<Record<string, unknown>>
    return rows.map(toEntity)
  }

  /** 查询全部绑定（含模型/供应商详情；场景名由 service 层从 LlmOperationManager 映射） */
  findAllWithProviderDetails(profile: string): SceneModelBinding[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT usm.scene_id, usm.scene_id AS scene_name, usm.model_id,
                cm.alias AS model_alias, cm.model_name, cm.provider_id,
                p.name AS provider_name, p.api_mode, usm.priority, usm.is_main
         FROM user_scene_models usm
         JOIN custom_models cm ON usm.model_id = cm.id
         JOIN system_providers p ON cm.provider_id = p.id
         WHERE usm.profile = ?
         ORDER BY usm.scene_id, usm.is_main DESC, usm.priority`
      )
      .all(profile) as Array<Record<string, unknown>>
    return rows.map((r) => ({
      sceneId: r.scene_id as string,
      sceneName: r.scene_name as string,
      modelId: r.model_id as string,
      modelAlias: r.model_alias as string,
      modelName: r.model_name as string,
      providerId: r.provider_id as string,
      providerName: r.provider_name as string,
      apiMode: r.api_mode as string,
      priority: r.priority as number,
      isMain: (r.is_main as number) === 1,
    }))
  }

  /** 绑定模型到场景（多模型——isMain=true 时清场景其他主模型） */
  bind(profile: string, sceneId: string, modelId: string, isMain: boolean, priority?: number): number {
    const db = getDatabase()
    if (isMain) {
      db.prepare('UPDATE user_scene_models SET is_main = 0 WHERE profile = ? AND scene_id = ?').run(profile, sceneId)
    }
    const p = priority ?? db
      .prepare('SELECT COALESCE(MAX(priority), -1) AS max_p FROM user_scene_models WHERE profile = ? AND scene_id = ?')
      .get(profile, sceneId) as { max_p: number }
    const maxP = typeof p === "number" ? p : Number(p.max_p); const next = priority !== undefined ? priority : maxP + 1
    const result = db
      .prepare(
        `INSERT INTO user_scene_models (profile, scene_id, model_id, priority, is_main)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (profile, scene_id, model_id) DO UPDATE SET priority = excluded.priority, is_main = excluded.is_main`
      )
      .run(profile, sceneId, modelId, next, isMain ? 1 : 0)
    return Number(result.changes)
  }

  /** 设置主模型（清场景其他主模型 + 设 is_main=1）——模型已在场景则仅改标记 */
  setMain(profile: string, sceneId: string, modelId: string): number {
    const db = getDatabase()
    db.prepare('UPDATE user_scene_models SET is_main = 0 WHERE profile = ? AND scene_id = ?').run(profile, sceneId)
    const existing = db
      .prepare('SELECT 1 FROM user_scene_models WHERE profile = ? AND scene_id = ? AND model_id = ?')
      .get(profile, sceneId, modelId)
    if (existing) {
      const result = db
        .prepare('UPDATE user_scene_models SET is_main = 1 WHERE profile = ? AND scene_id = ? AND model_id = ?')
        .run(profile, sceneId, modelId)
      return Number(result.changes)
    }
    return this.bind(profile, sceneId, modelId, true)
  }

  /** 删除指定模型的绑定 */
  deleteModel(profile: string, sceneId: string, modelId: string): number {
    const db = getDatabase()
    const result = db
      .prepare('DELETE FROM user_scene_models WHERE profile = ? AND scene_id = ? AND model_id = ?')
      .run(profile, sceneId, modelId)
    return Number(result.changes)
  }

  /** 删除场景下全部绑定 */
  deleteAll(profile: string, sceneId: string): number {
    const db = getDatabase()
    const result = db
      .prepare('DELETE FROM user_scene_models WHERE profile = ? AND scene_id = ?')
      .run(profile, sceneId)
    return Number(result.changes)
  }

  /** 重排场景绑定优先级（is_main 不变——reorder 只动备用顺序） */
  reorder(profile: string, sceneId: string, modelIds: string[]): void {
    const db = getDatabase()
    for (let i = 0; i < modelIds.length; i++) {
      db.prepare(
        'UPDATE user_scene_models SET priority = ? WHERE profile = ? AND scene_id = ? AND model_id = ?'
      ).run(i, profile, sceneId, modelIds[i])
    }
  }

  /** 主对话场景是否已配置 */
  isMainConversationConfigured(profile: string): boolean {
    return this.countConfiguredForMainConversation(profile) > 0
  }
}

function toEntity(row: Record<string, unknown>): UserSceneModelEntity {
  return {
    profile: row.profile as string,
    sceneId: row.scene_id as string,
    modelId: row.model_id as string,
    priority: row.priority as number,
    isMain: (row.is_main as number) === 1,
    createdAt: row.created_at as string | undefined,
  }
}
