
/**
 * private-skill-repository.ts — 私有技能仓库
 *
 * PrivateSkillRepository（去 user_id，UNIQUE(profile, name)）：
 * 表 private_skills — 用户私有技能（含运行时条件过滤、触发条件、配置声明）。
 */
import { getDatabase } from './database'
import type { FilteredSkillDTO, PrivateSkillEntity } from './types'



const COLS = 'id, name, display_name, description, category, version, author, license, platforms, tags, dependencies, requires_toolsets, requires_tools, fallback_for_toolsets, fallback_for_tools, triggers, trigger_conditions, config, env_vars, commands, envs, api_key, body, is_deleted, deleted_at, profile, official_skill_id, created_at, updated_at'

function toEntity(row: Record<string, unknown>): PrivateSkillEntity {
  return {
    id: String(row.id),
    name: row.name as string,
    displayName: row.display_name as string,
    description: row.description as string,
    category: row.category as string,
    version: row.version as string,
    author: row.author as string,
    license: row.license as string,
    platforms: row.platforms as string,
    tags: row.tags as string,
    dependencies: row.dependencies as string,
    requiresToolsets: row.requires_toolsets as string,
    requiresTools: row.requires_tools as string,
    fallbackForToolsets: row.fallback_for_toolsets as string,
    fallbackForTools: row.fallback_for_tools as string,
    triggers: row.triggers as string,
    triggerConditions: row.trigger_conditions as string,
    config: row.config as string,
    envVars: row.env_vars as string,
    commands: row.commands as string,
    envs: row.envs as string | null,
    apiKey: row.api_key as string | null,
    body: row.body as string,
    isDeleted: (row.is_deleted as number) === 1,
    deletedAt: row.deleted_at as string | null,
    profile: row.profile as string,
    officialSkillId: row.official_skill_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/** 私有技能仓库 */
export class PrivateSkillRepository {
  /** 按名称查询（profile 维度——排除软删） */
  findByName(profile: string, name: string, limit = 1): PrivateSkillEntity | null {
    const db = getDatabase()
    const row = db
      .prepare(`SELECT ${COLS} FROM private_skills WHERE profile = ? AND name = ? AND is_deleted = 0 LIMIT ?`)
      .get(profile, name, limit) as Record<string, unknown> | undefined
    return row ? toEntity(row) : null
  }

  /** 按 ID 查询 */
  findById(profile: string, id: string): PrivateSkillEntity | null {
    const db = getDatabase()
    const row = db
      .prepare(`SELECT ${COLS} FROM private_skills WHERE profile = ? AND id = ?`)
      .get(profile, id) as Record<string, unknown> | undefined
    return row ? toEntity(row) : null
  }

  /** 查询 profile 下全部技能 */
  findByAgent(profile: string): PrivateSkillEntity[] {
    const db = getDatabase()
    const rows = db.prepare(`SELECT ${COLS} FROM private_skills WHERE profile = ?`).all(profile) as Array<Record<string, unknown>>
    return rows.map(toEntity)
  }

  /** 统计同名技能数（排除软删——重名检查只看存活技能） */
  countByName(profile: string, name: string): number {
    const db = getDatabase()
    const row = db.prepare('SELECT COUNT(1) AS cnt FROM private_skills WHERE profile = ? AND name = ? AND is_deleted = 0').get(profile, name) as { cnt: number }
    return row.cnt
  }

  /** 统计未删除技能数 */
  countEnabled(profile: string): number {
    const db = getDatabase()
    const row = db.prepare('SELECT COUNT(1) AS cnt FROM private_skills WHERE profile = ? AND is_deleted = 0').get(profile) as { cnt: number }
    return row.cnt
  }

  /** 查询过滤后的技能列表（不含正文，轻量）——Agent 路径专用：过滤软删 */
  findFiltered(profile: string): FilteredSkillDTO[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT id, name, display_name, description, category, version, author, is_deleted,
                tags, api_key, platforms, requires_toolsets
         FROM private_skills WHERE profile = ? AND is_deleted = 0`
      )
      .all(profile) as Array<Record<string, unknown>>
    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      displayName: r.display_name as string,
      description: r.description as string,
      category: r.category as string,
      version: r.version as string,
      author: r.author as string,
      isDeleted: (r.is_deleted as number) === 1,
      tags: (r.tags as string) ?? '',
      apiKey: (r.api_key as string | null) ?? null,
      platforms: (r.platforms as string) ?? '',
      requiresToolsets: (r.requires_toolsets as string) ?? '',
    }))
  }

  /** 保存技能（UPSERT，冲突更新全部字段） */
  save(entity: PrivateSkillEntity): number {
    const db = getDatabase()
    const result = db
      .prepare(
        `INSERT INTO private_skills (
           id, name, display_name, description, category, version, author, license,
           platforms, tags, dependencies, requires_toolsets, requires_tools,
           fallback_for_toolsets, fallback_for_tools, triggers, trigger_conditions,
           config, env_vars, commands, envs, api_key, body, is_deleted, deleted_at,
           profile, official_skill_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (profile, name) DO UPDATE SET
           display_name = excluded.display_name,
           description = excluded.description,
           category = excluded.category,
           version = excluded.version,
           author = excluded.author,
           license = excluded.license,
           platforms = excluded.platforms,
           tags = excluded.tags,
           dependencies = excluded.dependencies,
           requires_toolsets = excluded.requires_toolsets,
           requires_tools = excluded.requires_tools,
           fallback_for_toolsets = excluded.fallback_for_toolsets,
           fallback_for_tools = excluded.fallback_for_tools,
           triggers = excluded.triggers,
           trigger_conditions = excluded.trigger_conditions,
           config = excluded.config,
           env_vars = excluded.env_vars,
           commands = excluded.commands,
           envs = excluded.envs,
           api_key = excluded.api_key,
           body = excluded.body,
           is_deleted = excluded.is_deleted,
           deleted_at = excluded.deleted_at,
           official_skill_id = excluded.official_skill_id,
           updated_at = datetime('now')`
      )
      .run(
        entity.id || null,
        entity.name,
        entity.displayName,
        entity.description ?? '',
        entity.category ?? '',
        entity.version ?? '',
        entity.author ?? '',
        entity.license ?? '',
        entity.platforms ?? '',
        entity.tags ?? '',
        entity.dependencies ?? '',
        entity.requiresToolsets ?? '',
        entity.requiresTools ?? '',
        entity.fallbackForToolsets ?? '',
        entity.fallbackForTools ?? '',
        entity.triggers ?? '',
        entity.triggerConditions ?? '',
        entity.config ?? '[]',
        entity.envVars ?? '',
        entity.commands ?? '',
        entity.envs,
        entity.apiKey,
        entity.body ?? '',
        entity.isDeleted ? 1 : 0,
        entity.deletedAt,
        entity.profile,
        entity.officialSkillId
      )
    return Number(result.changes)
  }

  /** 软删除技能 */
  softDelete(profile: string, id: string): number {
    const db = getDatabase()
    const result = db
      .prepare(
        `UPDATE private_skills SET is_deleted = 1, deleted_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ? AND profile = ?`
      )
      .run(id, profile)
    return Number(result.changes)
  }

  /** 硬删除技能（物理删行） */
  hardDelete(profile: string, id: string): number {
    const db = getDatabase()
    const result = db
      .prepare('DELETE FROM private_skills WHERE id = ? AND profile = ?')
      .run(id, profile)
    return Number(result.changes)
  }

  /** 恢复技能 */
  restore(profile: string, id: string): number {
    const db = getDatabase()
    const result = db
      .prepare(
        `UPDATE private_skills SET is_deleted = 0, deleted_at = NULL, updated_at = datetime('now')
         WHERE id = ? AND profile = ?`
      )
      .run(id, profile)
    return Number(result.changes)
  }
}
