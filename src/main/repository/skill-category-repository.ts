
import { getDatabase } from './database'
import type { SkillCategoryEntity } from './types'

const COLS = 'id, name, display_name, description, icon, sort_order, is_active, created_at, updated_at'

function toEntity(row: Record<string, unknown>): SkillCategoryEntity {
  return {
    id: row.id as string,
    name: row.name as string,
    displayName: row.display_name as string,
    description: row.description as string,
    icon: row.icon as string,
    sortOrder: row.sort_order as number,
    isActive: (row.is_active as number) === 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/** 技能分类仓库 */
export class SkillCategoryRepository {
  /** 查询全部分类 */
  findAll(): SkillCategoryEntity[] {
    const db = getDatabase()
    const rows = db.prepare(`SELECT ${COLS} FROM skill_categories ORDER BY sort_order, name`).all() as Array<Record<string, unknown>>
    return rows.map(toEntity)
  }

  /** 查询启用的分类 */
  findActive(): SkillCategoryEntity[] {
    const db = getDatabase()
    const rows = db
      .prepare(`SELECT ${COLS} FROM skill_categories WHERE is_active = 1 ORDER BY sort_order, name LIMIT 200`)
      .all() as Array<Record<string, unknown>>
    return rows.map(toEntity)
  }

  /** 按 ID 查询 */
  findById(id: string): SkillCategoryEntity | null {
    const db = getDatabase()
    const row = db.prepare(`SELECT ${COLS} FROM skill_categories WHERE id = ?`).get(id) as Record<string, unknown> | undefined
    return row ? toEntity(row) : null
  }

  /** 按名称查询 */
  findByName(name: string): SkillCategoryEntity | null {
    const db = getDatabase()
    const row = db.prepare(`SELECT ${COLS} FROM skill_categories WHERE name = ?`).get(name) as Record<string, unknown> | undefined
    return row ? toEntity(row) : null
  }

  /** 插入分类（名称冲突忽略） */
  insert(entity: SkillCategoryEntity): void {
    const db = getDatabase()
    db.prepare(
      `INSERT INTO skill_categories (id, name, display_name, description, icon, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (name) DO NOTHING`
    ).run(
      entity.id,
      entity.name,
      entity.displayName,
      entity.description ?? '',
      entity.icon ?? '',
      entity.sortOrder ?? 0,
      entity.isActive === false ? 0 : 1
    )
  }

  /** 更新分类 */
  update(entity: SkillCategoryEntity): number {
    const db = getDatabase()
    const result = db
      .prepare(
        `UPDATE skill_categories SET
           name = ?, display_name = ?, description = ?,
           icon = ?, sort_order = ?, is_active = ?,
           updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(entity.name, entity.displayName, entity.description, entity.icon, entity.sortOrder, entity.isActive ? 1 : 0, entity.id)
    return Number(result.changes)
  }
}
