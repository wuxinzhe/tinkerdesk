
import { getDatabase } from './database'
import type { SceneModelBinding, UserSceneModelEntity } from './types'
import { SCENE_CHAT } from '../core/llm/types'

/** 用户场景模型仓库 */
export class UserSceneModelRepository {
  /** 主对话场景是否已配置模型 */
  countConfiguredForMainConversation(profile: string): number {
    const db = getDatabase()
    const row = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM user_scene_models
         WHERE profile = ? AND scene_id = ? AND priority = 0`
      )
      .get(profile, SCENE_CHAT) as { cnt: number }
    return row.cnt
  }

  /** 查询场景下的主模型（priority=0） */
  findByUserAndScene(profile: string, sceneId: string): UserSceneModelEntity | null {
    const db = getDatabase()
    const row = db
      .prepare(
        `SELECT profile, scene_id, model_id, priority FROM user_scene_models
         WHERE profile = ? AND scene_id = ? AND priority = 0`
      )
      .get(profile, sceneId) as Record<string, unknown> | undefined
    return row ? toEntity(row) : null
  }

  /** 查询场景下的全部绑定（按优先级升序） */
  findByUserAndSceneAll(profile: string, sceneId: string): UserSceneModelEntity[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT profile, scene_id, model_id, priority FROM user_scene_models
         WHERE profile = ? AND scene_id = ? ORDER BY priority ASC`
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
                p.name AS provider_name, p.api_mode, usm.priority
         FROM user_scene_models usm
         JOIN custom_models cm ON usm.model_id = cm.id
         JOIN system_providers p ON cm.provider_id = p.id
         WHERE usm.profile = ?
         ORDER BY usm.scene_id, usm.priority`
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
    }))
  }

  /** 插入或更新绑定（priority=0 主模型） */
  upsert(profile: string, sceneId: string, modelId: string): number {
    const db = getDatabase()
    const result = db
      .prepare(
        `INSERT INTO user_scene_models (profile, scene_id, model_id, priority)
         VALUES (?, ?, ?, 0)
         ON CONFLICT (profile, scene_id, priority) DO UPDATE SET model_id = excluded.model_id`
      )
      .run(profile, sceneId, modelId)
    return Number(result.changes)
  }

  /** 删除主模型绑定 */
  delete(profile: string, sceneId: string): number {
    const db = getDatabase()
    const result = db
      .prepare('DELETE FROM user_scene_models WHERE profile = ? AND scene_id = ? AND priority = 0')
      .run(profile, sceneId)
    return Number(result.changes)
  }

  /** 删除指定优先级绑定 */
  deleteWithPriority(profile: string, sceneId: string, priority: number): number {
    const db = getDatabase()
    const result = db
      .prepare('DELETE FROM user_scene_models WHERE profile = ? AND scene_id = ? AND priority = ?')
      .run(profile, sceneId, priority)
    return Number(result.changes)
  }

  /** 查询场景下最大优先级 */
  findMaxPriority(profile: string, sceneId: string): number {
    const db = getDatabase()
    const row = db
      .prepare('SELECT COALESCE(MAX(priority), -1) AS max_p FROM user_scene_models WHERE profile = ? AND scene_id = ?')
      .get(profile, sceneId) as { max_p: number }
    return row.max_p
  }

  /** 插入带优先级的绑定 */
  upsertWithPriority(profile: string, sceneId: string, modelId: string, priority: number): number {
    const db = getDatabase()
    const result = db
      .prepare(
        `INSERT INTO user_scene_models (profile, scene_id, model_id, priority)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (profile, scene_id, priority) DO UPDATE SET model_id = excluded.model_id`
      )
      .run(profile, sceneId, modelId, priority)
    return Number(result.changes)
  }
}

function toEntity(row: Record<string, unknown>): UserSceneModelEntity {
  return {
    profile: row.profile as string,
    sceneId: row.scene_id as string,
    modelId: row.model_id as string,
    priority: row.priority as number,
    createdAt: row.created_at as string | undefined,
  }
}
