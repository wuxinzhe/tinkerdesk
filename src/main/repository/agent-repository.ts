/**
 * agent-repository.ts — agents 表仓库
 *
 * 复刻 tinker-agent AgentRepository：
 * Agent 配置（角色设定、显示信息、模式绑定）CRUD。
 * 本地单用户：主键从 (user_id, profile) 简化为 profile。
 */
import { getDatabase } from './database'
import type { AgentEntity, AgentModeInfoDTO } from './types'

/** Agent 实体（对应 AgentEntity） */

/** Agent 模式信息 DTO（对应 AgentModeInfoDTO） */

const COLS = 'profile, display_name, description, avatar, is_default, is_active, agent_mode_id, agent_mode_version, created_at, deleted_at'

function toEntity(row: Record<string, unknown>): AgentEntity {
  return {
    profile: row.profile as string,
    displayName: row.display_name as string,
    description: row.description as string,
    avatar: row.avatar as string,
    isDefault: (row.is_default as number) === 1,
    isActive: (row.is_active as number) === 1,
    agentModeId: row.agent_mode_id as string,
    agentModeVersion: row.agent_mode_version as string,
    createdAt: row.created_at as string,
    deletedAt: row.deleted_at as string | null,
  }
}

/** Agent 仓库 */
export class AgentRepository {
  /** 根据 profile 查询 Agent */
  findById(profile: string): AgentEntity | null {
    const db = getDatabase()
    const row = db
      .prepare(`SELECT ${COLS} FROM agents WHERE profile = ? AND deleted_at IS NULL`)
      .get(profile) as Record<string, unknown> | undefined
    return row ? toEntity(row) : null
  }

  /** 查询默认 Agent 的模式信息 */
  findDefaultAgentModeInfo(): AgentModeInfoDTO | null {
    const db = getDatabase()
    const row = db
      .prepare(
        `SELECT agent_mode_id, agent_mode_version FROM agents
         WHERE is_default = 1 AND is_active = 1 AND deleted_at IS NULL LIMIT 1`
      )
      .get() as { agent_mode_id: string; agent_mode_version: string } | undefined
    return row ? { agentModeId: row.agent_mode_id, agentModeVersion: row.agent_mode_version } : null
  }

  /** 查询所有 Agent（未删除，默认优先） */
  findByUser(): AgentEntity[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT ${COLS} FROM agents
         WHERE deleted_at IS NULL
         ORDER BY is_default DESC, created_at DESC`
      )
      .all() as Record<string, unknown>[]
    return rows.map(toEntity)
  }

  /** 统计未删除 Agent 总数 */
  countByUser(): number {
    const db = getDatabase()
    const row = db.prepare('SELECT COUNT(*) AS cnt FROM agents WHERE deleted_at IS NULL').get() as { cnt: number }
    return row.cnt
  }

  /** 保存或更新 Agent（UPSERT） */
  save(entity: AgentEntity): void {
    const db = getDatabase()
    db.prepare(
      `INSERT INTO agents (profile, display_name, description, avatar,
          is_default, is_active, agent_mode_id, agent_mode_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (profile) DO UPDATE SET
         display_name = excluded.display_name,
         description = excluded.description,
         avatar = excluded.avatar,
         is_default = excluded.is_default,
         is_active = excluded.is_active,
         agent_mode_id = excluded.agent_mode_id,
         agent_mode_version = excluded.agent_mode_version`
    ).run(
      entity.profile,
      entity.displayName,
      entity.description,
      entity.avatar,
      entity.isDefault ? 1 : 0,
      entity.isActive ? 1 : 0,
      entity.agentModeId,
      entity.agentModeVersion
    )
  }

  /** 软删除 Agent */
  delete(profile: string): number {
    const db = getDatabase()
    const result = db.prepare('UPDATE agents SET deleted_at = datetime(\'now\') WHERE profile = ?').run(profile)
    return Number(result.changes)
  }
}
