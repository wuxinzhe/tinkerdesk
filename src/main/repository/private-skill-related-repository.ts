
/**
 * private-skill-related-repository.ts — 私有技能关联仓库
 *
 * 复刻 tinker-agent PrivateSkillRelatedRepository：
 * 表 private_skill_related — 技能关联（related/prerequisite 等）。
 */
import { randomUUID } from 'crypto'
import { getDatabase } from './database'
import type { SkillRelatedEntity } from './types'

/** 私有技能关联仓库 */
export class PrivateSkillRelatedRepository {
  /** 插入关联（不存在才插入） */
  insertIfNotExists(skillId: string, relatedSkillId: string, relationType: string): number {
    const db = getDatabase()
    const existing = db
      .prepare('SELECT id FROM private_skill_related WHERE skill_id = ? AND related_skill_id = ? AND relation_type = ?')
      .get(skillId, relatedSkillId, relationType) as { id: string } | undefined
    if (existing) {
      return 0
    }
    const result = db
      .prepare(
        `INSERT INTO private_skill_related (id, skill_id, related_skill_id, relation_type)
         VALUES (?, ?, ?, ?)`
      )
      .run(randomUUID(), skillId, relatedSkillId, relationType ?? 'related')
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
      id: r.id as string,
      skillId: r.skill_id as string,
      relatedSkillId: r.related_skill_id as string,
      relationType: r.relation_type as string,
    }))
  }
}
