
/**
 * private-skill-file-repository.ts — 私有技能文件仓库
 *
 * 复刻 showing-agent PrivateSkillFileRepository：
 * 表 private_skill_files — 技能文件（SKILL.md 等），FK → private_skills。
 */
import {getDatabase} from './database'
import type {SkillFileEntity} from './types'

/** 私有技能文件仓库 */
export class PrivateSkillFileRepository {
  /** 按技能 ID 查询文件（按 sort_order 升序） */
  findBySkillId(skillId: string): SkillFileEntity[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT id, skill_id, file_type, content, language, sort_order
         FROM private_skill_files WHERE skill_id = ? ORDER BY sort_order ASC LIMIT 200`
      )
      .all(skillId) as Array<Record<string, unknown>>
    return rows.map(toEntity)
  }

  /** 保存文件（返回新 id） */
  save(entity: SkillFileEntity): number {
    const db = getDatabase()
    const result = db
      .prepare(
        `INSERT INTO private_skill_files (skill_id, file_type, content, language, sort_order)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(entity.skillId, entity.fileType, entity.content, entity.language ?? '', entity.sortOrder ?? 0)
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
}

function toEntity(row: Record<string, unknown>): SkillFileEntity {
  return {
    id: row.id as number,
    skillId: row.skill_id as string,
    fileType: row.file_type as string,
    content: row.content as string,
    language: row.language as string,
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as string,
  }
}
