
import { getDatabase } from './database'
import type { SystemProviderEntity } from './types'

const COLS = 'id, name, base_url, api_mode, description, sort_order'

function toEntity(row: Record<string, unknown>): SystemProviderEntity {
  return {
    id: row.id as string,
    name: row.name as string,
    baseUrl: row.base_url as string,
    apiMode: row.api_mode as string,
    description: row.description as string,
    sortOrder: row.sort_order as number,
  }
}

/** 系统供应商仓库 */
export class SystemProviderRepository {
  /** 查询全部供应商 */
  findAll(): SystemProviderEntity[] {
    const db = getDatabase()
    const rows = db.prepare(`SELECT ${COLS} FROM system_providers ORDER BY sort_order`).all() as Array<Record<string, unknown>>
    return rows.map(toEntity)
  }

  /** 按 ID 查询 */
  findById(id: string): SystemProviderEntity | null {
    const db = getDatabase()
    const row = db.prepare(`SELECT ${COLS} FROM system_providers WHERE id = ?`).get(id) as Record<string, unknown> | undefined
    return row ? toEntity(row) : null
  }

  /** 插入供应商（ID 冲突忽略） */
  insert(entity: SystemProviderEntity): void {
    const db = getDatabase()
    db.prepare(
      `INSERT INTO system_providers (id, name, base_url, api_mode, description, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`
    ).run(entity.id, entity.name, entity.baseUrl, entity.apiMode, entity.description, entity.sortOrder)
  }

  /** 更新供应商 */
  update(entity: SystemProviderEntity): number {
    const db = getDatabase()
    const result = db
      .prepare(
        `UPDATE system_providers SET name = ?, base_url = ?, api_mode = ?,
           description = ?, sort_order = ? WHERE id = ?`
      )
      .run(entity.name, entity.baseUrl, entity.apiMode, entity.description, entity.sortOrder, entity.id)
    return Number(result.changes)
  }

  /** 按 ID 删除 */
  deleteById(id: string): number {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM system_providers WHERE id = ?').run(id)
    return Number(result.changes)
  }
}
