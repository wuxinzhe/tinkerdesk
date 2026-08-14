
/**
 * private-skill-related-repository.ts — Private skill relation repository
 *
 * table private_skill_related — skill relations (related/prerequisite etc.).
 * id auto-increments (INTEGER PRIMARY KEY AUTOINCREMENT — no longer UUID).
 */
import { getDatabase } from './database'
import type { SkillRelatedEntity } from './types'

/** 私有技能关联仓库 */
export class PrivateSkillRelatedRepository {
  /** 插入关联（不存在才插入） */
  insertIfNotExists(skillId: string, relatedSkillId: string, relationType: string): number {
    const db = getDatabase()
    const existing = db
      .prepare('SELECT id FROM private_skill_related WHERE skill_id = ? AND related_skill_id = ? AND relation_type = ?')
      .get(skillId, relatedSkillId, relationType) as { id: number } | undefined
    if (existing) {
      return 0
    }
    const result = db
      .prepare(
        `INSERT INTO private_skill_related (skill_id, related_skill_id, relation_type)
         VALUES (?, ?, ?)`
      )
      .run(skillId, relatedSkillId, relationType ?? 'related')
    return Number(result.changes)
  }

  /** 查询技能的全部关联 */
  findBySkillId(skillId: string): SkillRelatedEntity[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT id, skill_id, related_skill_id, relation_type FROM private_skill_related
         WHERE skill_id = ?`
      )
      .all(skillId) as Array<Record<string, unknown>>
    return rows.map((r) => ({
      id: r.id as number,
      skillId: r.skill_id as string,
      relatedSkillId: r.related_skill_id as number,
      relationType: r.relation_type as string,
    }))
  }

  /** 删除技能的全部关联（skill_id 方向） */
  deleteBySkillId(skillId: string): number {
    const db = getDatabase()
    const r = db.prepare("DELETE FROM private_skill_related WHERE skill_id = ?").run(skillId); return Number(r.changes)
  }

  /** 删除指向某技能的全部关联（related_skill_id 方向——被引用方删除时清理） */
  deleteByRelatedSkillId(relatedSkillId: string): number {
    const db = getDatabase()
    const r = db.prepare("DELETE FROM private_skill_related WHERE related_skill_id = ?").run(relatedSkillId); return Number(r.changes)
  }
}
