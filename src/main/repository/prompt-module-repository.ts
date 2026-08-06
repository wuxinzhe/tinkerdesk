
/**
 * prompt-module-repository.ts — 提示词模块仓库
 *
 * 复刻 tinker-agent UserPromptModuleRepository（本地单用户版，去 user_id/User 前缀）：
 * 表 prompt_modules — 用户自定义静态提示词模块，纯文本内容，支持 {{变量名}} 模板替换。
 */
import { getDatabase } from './database'
import type { UserPromptModuleEntity } from './types'

const COLS = 'id, profile, name, content, sort_order, enabled, created_at, updated_at'

function toEntity(row: Record<string, unknown>): UserPromptModuleEntity {
  return {
    id: row.id as number,
    profile: row.profile as string,
    name: row.name as string,
    content: row.content as string,
    sortOrder: row.sort_order as number,
    enabled: (row.enabled as number) === 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/** 用户提示词模块仓库 */
export class PromptModuleRepository {
  /** 按 profile 查询全部模块（按 sort_order 升序） */
  findByProfile(profile: string): UserPromptModuleEntity[] {
    const db = getDatabase()
    const rows = db
      .prepare(`SELECT ${COLS} FROM prompt_modules WHERE profile = ? ORDER BY sort_order, id`)
      .all(profile) as Array<Record<string, unknown>>
    return rows.map(toEntity)
  }

  /** 按 ID 查询（profile 限定） */
  findById(id: number, profile: string): UserPromptModuleEntity | null {
    const db = getDatabase()
    const row = db.prepare(`SELECT ${COLS} FROM prompt_modules WHERE id = ? AND profile = ?`).get(id, profile) as Record<string, unknown> | undefined
    return row ? toEntity(row) : null
  }

  /** 统计启用的模块数 */
  countEnabled(profile: string): number {
    const db = getDatabase()
    const row = db.prepare('SELECT COUNT(*) AS cnt FROM prompt_modules WHERE profile = ? AND enabled = 1').get(profile) as { cnt: number }
    return row.cnt
  }

  /** 按名称统计（重名检查） */
  countByName(profile: string, name: string): number {
    const db = getDatabase()
    const row = db.prepare('SELECT COUNT(*) AS cnt FROM prompt_modules WHERE profile = ? AND name = ?').get(profile, name) as { cnt: number }
    return row.cnt
  }

  /** 插入模块（返回新 id） */
  insert(entity: UserPromptModuleEntity): number {
    const db = getDatabase()
    const result = db
      .prepare(
        `INSERT INTO prompt_modules (profile, name, content, sort_order, enabled)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(entity.profile, entity.name, entity.content, entity.sortOrder ?? 0, entity.enabled === false ? 0 : 1)
    return Number(result.lastInsertRowid)
  }

  /** 更新模块（profile 限定） */
  update(entity: UserPromptModuleEntity): number {
    const db = getDatabase()
    const result = db
      .prepare(
        `UPDATE prompt_modules SET name = ?, content = ?, sort_order = ?, enabled = ?,
           updated_at = datetime('now')
         WHERE id = ? AND profile = ?`
      )
      .run(entity.name, entity.content, entity.sortOrder, entity.enabled ? 1 : 0, entity.id!, entity.profile)
    return Number(result.changes)
  }

  /** 设置启用状态（profile 限定） */
  setEnabled(id: number, enabled: boolean, profile: string): number {
    const db = getDatabase()
    const result = db
      .prepare('UPDATE prompt_modules SET enabled = ?, updated_at = datetime(\'now\') WHERE id = ? AND profile = ?')
      .run(enabled ? 1 : 0, id, profile)
    return Number(result.changes)
  }

  /** 按 ID 删除（profile 限定） */
  deleteById(id: number, profile: string): number {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM prompt_modules WHERE id = ? AND profile = ?').run(id, profile)
    return Number(result.changes)
  }
}
