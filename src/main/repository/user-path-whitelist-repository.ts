
import { getDatabase } from './database'
import type { UserPathWhitelistEntity } from './types'

/** 用户路径白名单仓库 */
export class UserPathWhitelistRepository {
  /** 查询 profile 下启用的路径白名单 */
  findByProfile(profile: string): UserPathWhitelistEntity[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT id, profile, path_pattern, description, enabled, created_at
         FROM user_path_whitelist WHERE profile = ? AND enabled = 1 ORDER BY created_at`
      )
      .all(profile) as Array<Record<string, unknown>>
    return rows.map(toEntity)
  }

  /** 插入路径白名单（返回新 id） */
  insert(entity: UserPathWhitelistEntity): number {
    const db = getDatabase()
    const result = db
      .prepare(
        `INSERT INTO user_path_whitelist (profile, path_pattern, description, enabled)
         VALUES (?, ?, ?, 1)`
      )
      .run(entity.profile, entity.pathPattern, entity.description ?? '')
    return Number(result.lastInsertRowid)
  }

  /** 按 ID 删除 */
  deleteById(id: number, profile: string): number {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM user_path_whitelist WHERE id = ? AND profile = ?').run(id, profile)
    return Number(result.changes)
  }
}

function toEntity(row: Record<string, unknown>): UserPathWhitelistEntity {
  return {
    id: row.id as number,
    profile: row.profile as string,
    pathPattern: row.path_pattern as string,
    description: (row.description as string) ?? '',
    enabled: (row.enabled as number) === 1,
    createdAt: row.created_at as string,
  }
}
