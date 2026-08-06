/**
 * session-repository.ts — sessions 表仓库
 *
 * 复刻 tinker-agent SessionRepository：
 * 会话 CRUD、用户会话列表、标题搜索、浏览摘要、YOLO 切换。
 * 本地单用户：去掉 user_id 维度（表里已无 user_id 列）。
 */
import { getDatabase } from './database'
import type { SessionEntity, SessionSummaryDTO } from './types'

/** 会话实体（对应 SessionEntity） */

/** 会话摘要 DTO（对应 SessionSummaryDTO） */

const COLS = 'id, profile, source, system_prompt, parent_session_id, title, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, estimated_cost_usd, message_count, tool_call_count, rewind_count, started_at, archived, yolo'

function toEntity(row: Record<string, unknown>): SessionEntity {
  return {
    id: row.id as string,
    profile: row.profile as string,
    source: row.source as string,
    systemPrompt: row.system_prompt as string,
    parentSessionId: row.parent_session_id as string | null,
    title: row.title as string,
    inputTokens: row.input_tokens as number,
    outputTokens: row.output_tokens as number,
    cacheReadTokens: row.cache_read_tokens as number,
    cacheWriteTokens: row.cache_write_tokens as number,
    estimatedCostUsd: row.estimated_cost_usd as number,
    messageCount: row.message_count as number,
    toolCallCount: row.tool_call_count as number,
    rewindCount: row.rewind_count as number,
    startedAt: row.started_at as string,
    archived: (row.archived as number) === 1,
    yolo: (row.yolo as number) === 1,
  }
}

/** 会话仓库 */
export class SessionRepository {
  /** 保存或更新会话（UPSERT） */
  save(entity: SessionEntity): void {
    const db = getDatabase()
    db.prepare(
      `INSERT INTO sessions (id, profile, source, system_prompt, parent_session_id,
          title, input_tokens, output_tokens,
          cache_read_tokens, cache_write_tokens, estimated_cost_usd, message_count,
          tool_call_count, rewind_count, started_at, archived, yolo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         profile = excluded.profile,
         source = excluded.source,
         system_prompt = excluded.system_prompt,
         parent_session_id = excluded.parent_session_id,
         title = excluded.title,
         input_tokens = excluded.input_tokens,
         output_tokens = excluded.output_tokens,
         cache_read_tokens = excluded.cache_read_tokens,
         cache_write_tokens = excluded.cache_write_tokens,
         estimated_cost_usd = excluded.estimated_cost_usd,
         message_count = excluded.message_count,
         tool_call_count = excluded.tool_call_count,
         rewind_count = excluded.rewind_count,
         started_at = excluded.started_at,
         archived = excluded.archived,
         yolo = excluded.yolo`
    ).run(
      entity.id,
      entity.profile,
      entity.source,
      entity.systemPrompt,
      entity.parentSessionId,
      entity.title,
      entity.inputTokens,
      entity.outputTokens,
      entity.cacheReadTokens,
      entity.cacheWriteTokens,
      entity.estimatedCostUsd,
      entity.messageCount,
      entity.toolCallCount,
      entity.rewindCount,
      entity.startedAt,
      entity.archived ? 1 : 0,
      entity.yolo ? 1 : 0
    )
  }

  /** 更新会话 system_prompt */
  updateSystemPrompt(sessionId: string, systemPrompt: string, profile: string): number {
    const db = getDatabase()
    const result = db
      .prepare('UPDATE sessions SET system_prompt = ? WHERE id = ? AND profile = ?')
      .run(systemPrompt, sessionId, profile)
    return Number(result.changes)
  }

  /** 根据 ID 查询会话（profile 限定） */
  findById(id: string, profile: string): SessionEntity | null {
    const db = getDatabase()
    const row = db.prepare(`SELECT ${COLS} FROM sessions WHERE id = ? AND profile = ?`).get(id, profile) as Record<string, unknown> | undefined
    return row ? toEntity(row) : null
  }

  /** 分页查询会话列表（按开始时间降序） */
  findByUser(profile: string, limit = 50, offset = 0): SessionEntity[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT ${COLS} FROM sessions
         WHERE profile = ? AND archived = 0
         ORDER BY started_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(profile, limit, offset) as Record<string, unknown>[]
    return rows.map(toEntity)
  }

  /** 查询有缓存（system_prompt 非空）的会话 ID 列表 */
  findSessionIdsWithCache(profile: string): string[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT id FROM sessions
         WHERE profile = ? AND archived = 0 AND system_prompt IS NOT NULL AND system_prompt != ''
         LIMIT 1000`
      )
      .all(profile) as Array<{ id: string }>
    return rows.map((r) => r.id)
  }

  /** 根据标题模糊搜索最新会话 */
  findByTitleLike(query: string, profile: string): SessionEntity | null {
    const db = getDatabase()
    const row = db
      .prepare(
        `SELECT ${COLS} FROM sessions
        WHERE LOWER(title) LIKE LOWER(?) AND profile = ? AND archived = 0
        ORDER BY started_at DESC LIMIT 1`
      )
      .get(`%${query}%`, profile) as Record<string, unknown> | undefined
    return row ? toEntity(row) : null
  }

  /** 根据标题模糊搜索全部匹配会话（DISCOVER 模式） */
  findByTitleLikeAll(query: string, profile: string, limit: number): SessionEntity[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT ${COLS} FROM sessions
        WHERE LOWER(title) LIKE LOWER(?) AND profile = ? AND archived = 0
        ORDER BY started_at DESC LIMIT ?`
      )
      .all(`%${query}%`, profile, limit) as Array<Record<string, unknown>>
    return rows.map(toEntity)
  }

  /** 浏览会话摘要列表（对话历史界面） */
  browseRich(profile: string, excludeSessionId: string, limit: number): SessionSummaryDTO[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT s.id AS session_id, COALESCE(s.title, '') AS title,
                COALESCE((SELECT content FROM messages WHERE session_id = s.id AND content != '' ORDER BY id DESC LIMIT 1), '') AS preview,
                COALESCE(s.source, '') AS source,
                s.started_at AS last_activity,
                COALESCE(s.message_count, 0) AS message_count
         FROM sessions s
         WHERE s.profile = ?
           AND (s.source IS NULL OR s.source NOT IN ('tool'))
           AND s.id <> ?
           AND s.archived = 0
         ORDER BY s.started_at DESC
         LIMIT ?`
      )
      .all(profile, excludeSessionId, limit) as Array<{
        session_id: string
        title: string
        preview: string
        source: string
        last_activity: string
        message_count: number
      }>
    return rows.map((r) => ({
      sessionId: r.session_id,
      title: r.title,
      preview: r.preview,
      source: r.source,
      lastActivity: r.last_activity,
      messageCount: r.message_count,
    }))
  }

  /** 切换会话 YOLO 模式，返回切换后的值 */
  toggleYolo(sessionId: string, profile: string): boolean {
    const db = getDatabase()
    db.prepare('UPDATE sessions SET yolo = CASE yolo WHEN 1 THEN 0 ELSE 1 END WHERE id = ? AND profile = ?').run(
      sessionId,
      profile
    )
    const row = db.prepare('SELECT yolo FROM sessions WHERE id = ? AND profile = ?').get(sessionId, profile) as
      | { yolo: number }
      | undefined
    return (row?.yolo ?? 0) === 1
  }
}
