/**
 * conversation-repository.ts — conversations 表仓库
 *
 * ConversationRepository：
 * 对话 CRUD、状态变更、压缩选择。
 */
import { getDatabase } from './database'
import { nowDb } from '../utils/time'
import type { ConversationEntity, ConversationStatusUpdate } from './types'

/** 对话状态常量（单一来源在 core/constants/conversation；此处 re-export 保持既有导入链） */
export { CONV_IN_PROGRESS, CONV_COMPLETED, CONV_COMPRESSED } from '../core/constants/conversation'
import { CONV_IN_PROGRESS, CONV_COMPLETED } from '../core/constants/conversation'

/** 对话实体（对应 ConversationEntity） */

/** 更新状态参数 */

const COLS = 'id, session_id, status, message_count, estimated_tokens, total_tokens, cache_read_tokens, cache_write_tokens, duration_ms, iteration_count, llm_request_count, round_context_tokens, started_at, completed_at'

function toEntity(row: Record<string, unknown>): ConversationEntity {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    status: row.status as string,
    messageCount: row.message_count as number,
    estimatedTokens: row.estimated_tokens as number,
    totalTokens: row.total_tokens as number,
    cacheReadTokens: row.cache_read_tokens as number,
    cacheWriteTokens: row.cache_write_tokens as number,
    durationMs: row.duration_ms as number,
    iterationCount: row.iteration_count as number,
    llmRequestCount: row.llm_request_count as number,
    roundContextTokens: row.round_context_tokens as number,
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string | null,
  }
}

/** 对话仓库 */
export class ConversationRepository {
  /** 保存或更新对话（UPSERT） */
  save(entity: ConversationEntity): void {
    const db = getDatabase()
    db.prepare(
      `INSERT INTO conversations (id, session_id, status, message_count,
          estimated_tokens, total_tokens, cache_read_tokens, cache_write_tokens, duration_ms, iteration_count, llm_request_count, round_context_tokens, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
        session_id = excluded.session_id,
        status = excluded.status,
        message_count = excluded.message_count,
        estimated_tokens = excluded.estimated_tokens,
        total_tokens = excluded.total_tokens,
        cache_read_tokens = excluded.cache_read_tokens,
        cache_write_tokens = excluded.cache_write_tokens,
        duration_ms = excluded.duration_ms,
        iteration_count = excluded.iteration_count,
        llm_request_count = excluded.llm_request_count,
        round_context_tokens = excluded.round_context_tokens,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at`
    ).run(
      entity.id,
      entity.sessionId,
      entity.status,
      entity.messageCount,
      entity.estimatedTokens,
      entity.totalTokens,
      entity.cacheReadTokens,
      entity.cacheWriteTokens,
      entity.durationMs ?? 0,
      entity.iterationCount ?? 0,
      entity.llmRequestCount ?? 0,
      entity.roundContextTokens ?? 0,
      entity.startedAt ?? nowDb(),
      entity.completedAt ?? null
    )
  }

  /** 根据 ID 查询对话 */
  findById(id: string): ConversationEntity | null {
    const db = getDatabase()
    const row = db.prepare(`SELECT ${COLS} FROM conversations WHERE id = ?`).get(id) as Record<string, unknown> | undefined
    return row ? toEntity(row) : null
  }

  /** 查询会话中进行中的对话（IN_PROGRESS，最多 1 条） */
  findInProgress(sessionId: string): ConversationEntity | null {
    const db = getDatabase()
    const row = db
      .prepare(`SELECT ${COLS} FROM conversations WHERE session_id = ? AND status = ? LIMIT 1`)
      .get(sessionId, CONV_IN_PROGRESS) as Record<string, unknown> | undefined
    return row ? toEntity(row) : null
  }

  /** 判断是否存在进行中的对话 */
  hasInProgressConversation(profile: string): boolean {
    const db = getDatabase()
    const row = db
      .prepare(
        `SELECT EXISTS(
           SELECT 1 FROM conversations c
           JOIN sessions s ON c.session_id = s.id
           WHERE s.profile = ? AND c.status = ?
           LIMIT 1
         ) AS ex`
      )
      .get(profile, CONV_IN_PROGRESS) as { ex: number }
    return row.ex === 1
  }

  /** 找出需要压缩的对话 ID（窗口函数：尾部预算外更旧的对话） */
  findCompressConvIds(sessionId: string, tailTokenBudget: number): string[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `WITH numbered AS (
           SELECT id, estimated_tokens,
                  ROW_NUMBER() OVER (ORDER BY started_at DESC) - 1 AS rn
           FROM conversations
           WHERE session_id = ? AND status = ?
         ),
         running AS (
           SELECT id, rn, SUM(estimated_tokens) OVER (ORDER BY rn) AS tail_running
           FROM numbered
         ),
         split AS (
           SELECT COALESCE(MIN(rn), -1) AS split_rn
           FROM running
           WHERE tail_running >= ?
         )
         SELECT n.id FROM numbered n
         WHERE n.rn > (SELECT split_rn FROM split)
         ORDER BY n.rn DESC`
      )
      .all(sessionId, CONV_COMPLETED, tailTokenBudget) as Array<{ id: string }>
    return rows.map((r) => r.id)
  }

  /** 更新对话状态及相关统计 */
  updateStatus(id: string, sessionId: string, status: string, update?: ConversationStatusUpdate): number {
    const db = getDatabase()
    const sets = ['status = ?', 'completed_at = ?']
    const params: Array<string | number> = [status, nowDb()]

    if (update?.messageCount !== undefined) {
      sets.push('message_count = ?')
      params.push(update.messageCount)
    }
    if (update?.estimatedTokens !== undefined) {
      sets.push('estimated_tokens = ?')
      params.push(update.estimatedTokens)
    }
    if (update?.totalTokens !== undefined) {
      sets.push('total_tokens = ?')
      params.push(update.totalTokens)
    }
    if (update?.cacheReadTokens !== undefined) {
      sets.push('cache_read_tokens = ?')
      params.push(update.cacheReadTokens)
    }
    if (update?.cacheWriteTokens !== undefined) {
      sets.push('cache_write_tokens = ?')
      params.push(update.cacheWriteTokens)
    }
    if (update?.durationMs !== undefined) {
      sets.push('duration_ms = ?')
      params.push(update.durationMs)
    }
    if (update?.iterationCount !== undefined) {
      sets.push('iteration_count = ?')
      params.push(update.iterationCount)
    }
    if (update?.llmRequestCount !== undefined) {
      sets.push('llm_request_count = ?')
      params.push(update.llmRequestCount)
    }
    if (update?.roundContextTokens !== undefined) {
      sets.push('round_context_tokens = ?')
      params.push(update.roundContextTokens)
    }

    params.push(id, sessionId)
    const result = db
      .prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ? AND session_id = ?`)
      .run(...params)
    return Number(result.changes)
  }

  /** 批量更新多个对话的状态（压缩时标记旧对话） */
  batchUpdateStatus(sessionId: string, ids: string[], status: string): number {
    if (ids.length === 0) {
      return 0
    }
    const db = getDatabase()
    const placeholders = ids.map(() => '?').join(',')
    const result = db
      .prepare(
        `UPDATE conversations SET status = ?, completed_at = ?
         WHERE session_id = ? AND id IN (${placeholders})`
      )
      .run(status, nowDb(), sessionId, ...ids)
    return Number(result.changes)
  }
}
