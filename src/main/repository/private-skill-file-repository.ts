
/**
 * private-skill-file-repository.ts — Private skill file repository
 *
 * PrivateSkillFileRepository:
 * table private_skill_files — skill files (SKILL.md etc.), FK → private_skills.
 */
import { getDatabase } from './database'
import type { SkillFileEntity } from './types'

/** 私有技能文件仓库 */
export class PrivateSkillFileRepository {
  /** 按技能 ID 查询文件（按 sort_order 升序） */
  findBySkillId(skillId: string): SkillFileEntity[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT id, skill_id, file_type, name, content, language, sort_order
         FROM private_skill_files WHERE skill_id = ? ORDER BY sort_order ASC LIMIT 200`
      )
      .all(skillId) as Array<Record<string, unknown>>
    return rows.map(toEntity)
  }

  /** 保存文件（UPSERT——按 (skill_id, file_type, sort_order) 冲突更新——
   * write_file 覆盖语义：重复写同一文件不报 UNIQUE 冲突） */
  save(entity: SkillFileEntity): number {
    const db = getDatabase()
    const result = db
      .prepare(
        `INSERT INTO private_skill_files (skill_id, file_type, name, content, language, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (skill_id, file_type, sort_order) DO UPDATE SET
           name = excluded.name,
           content = excluded.content,
           language = excluded.language`
      )
      .run(entity.skillId, entity.fileType, entity.name ?? '', entity.content, entity.language ?? '', entity.sortOrder ?? 0)
    return Number(result.lastInsertRowid)
  }

  /** 删除技能下指定类型的文件 */
  deleteBySkillIdAndFileType(skillId: string, fileType: string): number {
    const db = getDatabase()
    const result = db
      .prepare('DELETE FROM private_skill_files WHERE skill_id = ? AND file_type = ?')
      .run(skillId, fileType)
    return Number(result.changes)
  }

  /** 删除技能下全部文件（硬删技能时级联清理） */
  deleteBySkillId(skillId: string): number {
    const db = getDatabase()
    const result = db
      .prepare('DELETE FROM private_skill_files WHERE skill_id = ?')
      .run(skillId)
    return Number(result.changes)
  }

  /** 按 id 更新文件（fileType/name/content/language/sortOrder） */
  update(entity: SkillFileEntity): boolean {
    const db = getDatabase()
    const result = db
      .prepare(
        `UPDATE private_skill_files
         SET file_type = ?, name = ?, content = ?, language = ?, sort_order = ?
         WHERE id = ?`
      )
      .run(entity.fileType, entity.name ?? '', entity.content, entity.language ?? '', entity.sortOrder ?? 0, entity.id ?? -1)
    return Number(result.changes) > 0
  }

  /** 按 id 删除文件 */
  deleteById(id: number): boolean {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM private_skill_files WHERE id = ?').run(id)
    return Number(result.changes) > 0
  }

  /** 按 id 查询单条 */
  findById(id: number): SkillFileEntity | null {
    const db = getDatabase()
    const row = db
      .prepare(
        `SELECT id, skill_id, file_type, name, content, language, sort_order, created_at
         FROM private_skill_files WHERE id = ?`
      )
      .get(id) as Record<string, unknown> | undefined
    return row ? toEntity(row) : null
  }
}

function toEntity(row: Record<string, unknown>): SkillFileEntity {
  return {
    id: row.id as number,
    skillId: row.skill_id as string,
    fileType: row.file_type as string,
    name: (row.name as string) ?? '',
    content: row.content as string,
    language: row.language as string,
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as string,
  }
}
