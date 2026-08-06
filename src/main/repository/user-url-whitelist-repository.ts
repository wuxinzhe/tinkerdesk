
import { getDatabase } from './database'
import type { UserUrlWhitelistEntity } from './types'

/** 用户 URL 白名单仓库 */
export class UserUrlWhitelistRepository {
  /** 查询 profile 下启用的 URL 白名单 */
  findByProfile(profile: string): UserUrlWhitelistEntity[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT id, profile, url_pattern, description, enabled, created_at
         FROM user_url_whitelist WHERE profile = ? AND enabled = 1 ORDER BY created_at`
      )
      .all(profile) as Array<Record<string, unknown>>
    return rows.map(toEntity)
  }

  /** 插入 URL 白名单（返回新 id） */
  insert(entity: UserUrlWhitelistEntity): number {
    const db = getDatabase()
    const result = db
      .prepare(
        `INSERT INTO user_url_whitelist (profile, url_pattern, description, enabled)
         VALUES (?, ?, ?, 1)`
      )
      .run(entity.profile, entity.urlPattern, entity.description ?? '')
    return Number(result.lastInsertRowid)
  }

  /** 按 ID 删除 */
  deleteById(id: number, profile: string): number {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM user_url_whitelist WHERE id = ? AND profile = ?').run(id, profile)
    return Number(result.changes)
  }
}

function toEntity(row: Record<string, unknown>): UserUrlWhitelistEntity {
  return {
    id: row.id as number,
    profile: row.profile as string,
    urlPattern: row.url_pattern as string,
    description: (row.description as string) ?? '',
    enabled: (row.enabled as number) === 1,
    createdAt: row.created_at as string,
  }
}
