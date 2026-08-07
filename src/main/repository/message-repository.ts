/**
 * message-repository.ts — messages 表仓库
 *
 * 复刻 tinker-agent MessageRepository：
 * 消息 CRUD、条件查询、分页、会话历史加载。
 * 本地单用户：去掉 user_id 维度（表里已无 user_id 列）。
 */
import { getDatabase } from './database'
import type { MessageEntity, MessageQuery, SessionMessageQuery } from './types'
import { STATUS_PENDING, STATUS_TIMED_OUT } from '../core/loop/constants'

/** 消息实体（对应 MessageEntity） */

/** 查询条件（findByConditions 参数） */

/** 会话消息查询条件（findMessagesBySession 参数） */

// ── 列清单 ──
const COLS = 'm.id, m.session_id, m.conversation_id, m.profile, m.role, m.content, m.reasoning_content, m.tool_call, m.tool_call_id, m.tool_name, m.finish_reason, m.interaction_status, m.message_type, m.deleted, m.created_at, m.updated_at'

/** 行 → 实体（强类型校验） */
function toEntity(row: Record<string, unknown>): MessageEntity {
  return {
    id: row.id as number,
    sessionId: row.session_id as string,
    conversationId: row.conversation_id as string | null,
    profile: row.profile as string,
    role: row.role as string,
    content: row.content as string,
    reasoningContent: row.reasoning_content as string,
    toolCall: row.tool_call as string | null,
    toolCallId: row.tool_call_id as string,
    toolName: row.tool_name as string,
    finishReason: row.finish_reason as string,
    interactionStatus: row.interaction_status as string,
    messageType: row.message_type as string,
    deleted: (row.deleted as number) === 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/** 消息仓库 */
export class MessageRepository {
  /** 插入消息（返回新 id） */
  save(entity: MessageEntity): number {
    const db = getDatabase()
    const result = db
      .prepare(
        `INSERT INTO messages (session_id, conversation_id, profile, role,
            content, reasoning_content, tool_call, tool_call_id, tool_name, finish_reason,
            interaction_status, message_type, deleted, prompt_tokens, completion_tokens, cache_read_tokens, cache_write_tokens)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entity.sessionId,
        entity.conversationId,
        entity.profile,
        entity.role,
        entity.content,
        entity.reasoningContent ?? '',
        entity.toolCall,
        entity.toolCallId ?? '',
        entity.toolName ?? '',
        entity.finishReason ?? 'complete',
        entity.interactionStatus ?? '',
        entity.messageType ?? '',
        entity.deleted ? 1 : 0,
        entity.promptTokens ?? 0,
        entity.completionTokens ?? 0,
        entity.cacheReadTokens ?? 0,
        entity.cacheWriteTokens ?? 0
      )
    return Number(result.lastInsertRowid)
  }

  /** 批量插入消息 */
  saveAll(entities: MessageEntity[]): number {
    const db = getDatabase()
    const stmt = db.prepare(
      `INSERT INTO messages (session_id, conversation_id, profile, role,
          content, reasoning_content, tool_call, tool_call_id, tool_name, finish_reason,
          interaction_status, message_type, deleted, prompt_tokens, completion_tokens, cache_read_tokens, cache_write_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    let count = 0
    for (const e of entities) {
      stmt.run(
        e.sessionId,
        e.conversationId,
        e.profile,
        e.role,
        e.content,
        e.reasoningContent ?? '',
        e.toolCall,
        e.toolCallId ?? '',
        e.toolName ?? '',
        e.finishReason ?? 'complete',
        e.interactionStatus ?? '',
        e.messageType ?? '',
        e.deleted ? 1 : 0,
        e.promptTokens ?? 0,
        e.completionTokens ?? 0,
        e.cacheReadTokens ?? 0,
        e.cacheWriteTokens ?? 0
      )
      count++
    }
    return count
  }

  /** 查询已完成对话的历史消息（用于 LLM 上下文恢复） */
  findBySessionCompleted(sessionId: string, profile: string, status: string): MessageEntity[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT ${COLS} FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE m.session_id = ? AND m.profile = ?
           AND c.status = ? AND m.deleted = 0
         ORDER BY m.created_at ASC, m.id ASC
         LIMIT 2000`
      )
      .all(sessionId, profile, status) as Record<string, unknown>[]
    return rows.map(toEntity)
  }

  /** 按对话 ID 列表批量加载消息（用于压缩加载旧对话） */
  findByConversationIds(convIds: string[], sessionId: string, profile: string): MessageEntity[] {
    if (convIds.length === 0) {
      return []
    }
    const db = getDatabase()
    const placeholders = convIds.map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT ${COLS} FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE m.conversation_id IN (${placeholders})
           AND c.session_id = ? AND m.profile = ? AND m.deleted = 0
         ORDER BY m.created_at ASC, m.id ASC
         LIMIT 2000`
      )
      .all(...convIds, sessionId, profile) as Record<string, unknown>[]
    return rows.map(toEntity)
  }

  /** 通用动态条件查询 */
  findByConditions(query: MessageQuery): MessageEntity[] {
    const db = getDatabase()
    const where: string[] = ['deleted = 0']
    const params: Array<string | number> = []

    if (query.messageType) {
      where.push('message_type = ?')
      params.push(query.messageType)
    }
    if (query.messageTypes && query.messageTypes.length > 0) {
      where.push(`message_type IN (${query.messageTypes.map(() => '?').join(',')})`)
      params.push(...query.messageTypes)
    }
    if (query.excludeMessageTypes && query.excludeMessageTypes.length > 0) {
      where.push(`message_type NOT IN (${query.excludeMessageTypes.map(() => '?').join(',')})`)
      params.push(...query.excludeMessageTypes)
    }
    if (query.conversationId) {
      where.push('conversation_id = ?')
      params.push(query.conversationId)
    }
    if (query.sessionId) {
      where.push('session_id = ?')
      params.push(query.sessionId)
    }
    if (query.profile) {
      where.push('profile = ?')
      params.push(query.profile)
    }

    const order = query.sortDesc ? 'DESC' : 'ASC'
    const rows = db
      .prepare(`SELECT ${COLS} FROM messages m WHERE ${where.join(' AND ')} ORDER BY m.created_at ${order}, m.id ASC LIMIT 2000`)
      .all(...params) as Record<string, unknown>[]
    return rows.map(toEntity)
  }

  /** 会话消息查询（支持角色过滤、排序、分页） */
  findMessagesBySession(query: SessionMessageQuery): MessageEntity[] {
    const db = getDatabase()
    const where: string[] = ['m.session_id = ?', 'm.profile = ?', 'm.deleted = 0']
    const params: Array<string | number> = [query.sessionId, query.profile]
    if (query.roles && query.roles.length > 0) {
      where.push(`m.role IN (${query.roles.map(() => '?').join(',')})`)
      params.push(...query.roles)
    }

    const order = query.sortOrder === 'DESC' ? 'DESC' : 'ASC'
    let sql = `SELECT ${COLS} FROM messages m WHERE ${where.join(' AND ')} ORDER BY m.id ${order}`
    if (query.limit && query.limit > 0) {
      sql += ' LIMIT ?'
      params.push(query.limit)
    }
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
    return rows.map(toEntity)
  }

  /** 列出会话全部消息（READ/SCROLL 模式用，profile 限定） */
  listAllBySession(sessionId: string, profile: string, limit = 10000): MessageEntity[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT ${COLS} FROM messages m
        WHERE m.session_id = ? AND m.profile = ? AND m.deleted = 0
        ORDER BY m.id ASC LIMIT ?`
      )
      .all(sessionId, profile, limit) as Record<string, unknown>[]
    return rows.map(toEntity)
  }

  /**
   * 全文检索消息（对齐 Java FTS discover 功能，SQLite 用 LIKE 近似）：
   * 内容 LIKE 匹配 + 角色过滤 + 排除 source='tool' 会话 + profile 限定。
   */
  discoverHits(query: string, roles: string[], sort: string | null, profile: string, limit: number): Array<{ id: number; sessionId: string; matchedRole: string; snippet: string; title: string; when: string }> {
    const db = getDatabase()
    const where: string[] = ['m.content LIKE ?', 'm.deleted = 0', 's.source IS NULL OR s.source NOT IN (?)']
    const params: Array<string | number> = [`%${query}%`, 'tool']
    if (roles.length > 0) {
      where.push(`m.role IN (${roles.map(() => '?').join(',')})`)
      params.push(...roles)
    }
    where.push('s.profile = ?')
    params.push(profile)
    const order = sort === 'newest' ? 'm.created_at DESC' : sort === 'oldest' ? 'm.created_at ASC' : 'm.created_at DESC'
    const rows = db
      .prepare(
        `SELECT m.id, m.session_id, m.role AS matchedRole, substr(m.content, 1, 120) AS snippet,
                s.title, s.started_at AS when
         FROM messages m JOIN sessions s ON m.session_id = s.id
         WHERE ${where.join(' AND ')}
         ORDER BY ${order} LIMIT ?`
      )
      .all(...params, limit) as Array<{ id: number; session_id: string; matchedRole: string; snippet: string; title: string; when: string }>
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      matchedRole: r.matchedRole,
      snippet: r.snippet,
      title: r.title,
      when: r.when,
    }))
  }

  /** 按 ID 范围查找消息窗口（滚动浏览） */
  findWindowByIdRange(sessionId: string, lower: number, upper: number, profile: string): MessageEntity[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT ${COLS} FROM messages m
         WHERE m.session_id = ? AND m.id >= ? AND m.id <= ? AND m.profile = ? AND m.deleted = 0
         ORDER BY m.id ASC`
      )
      .all(sessionId, lower, upper, profile) as Record<string, unknown>[]
    return rows.map(toEntity)
  }

  /** 统计指定消息前后符合条件的消息数量 */
  countRelative(scope: 'before' | 'after', sessionId: string, messageId: number, profile: string, roles?: string[]): number {
    const db = getDatabase()
    const op = scope === 'before' ? '<' : '>'
    const params: Array<string | number> = [sessionId, profile, messageId]
    let sql = `SELECT COUNT(*) as cnt FROM messages m
               WHERE m.session_id = ? AND m.profile = ? AND m.deleted = 0 AND m.id ${op} ?`
    if (roles && roles.length > 0) {
      sql += ` AND m.role IN (${roles.map(() => '?').join(',')})`
      params.push(...roles)
    }
    const row = db.prepare(sql).get(...params) as { cnt: number }
    return row.cnt
  }

  /** 更新交互状态（批准/拒绝工具调用） */
  updateApprovalStatus(toolCallId: string, status: string, content: string, profile: string, sessionId: string): number {
    const db = getDatabase()
    const result = db
      .prepare(
        `UPDATE messages SET interaction_status = ?, content = ?, updated_at = datetime('now')
         WHERE role = 'approval' AND tool_call_id = ?
           AND profile = ? AND session_id = ?`
      )
      .run(status, content, toolCallId, profile, sessionId)
    return Number(result.changes)
  }

  /** 标记待交互消息为超时 */
  updateApprovalStatusTimedOut(toolCallId: string, profile: string, sessionId: string): number {
    const db = getDatabase()
    const result = db
      .prepare(
        `UPDATE messages SET interaction_status = ?, content = '⏳ 已过期', updated_at = datetime('now')
         WHERE role = 'approval' AND tool_call_id = ? AND interaction_status = ?
           AND profile = ? AND session_id = ?`
      )
      .run(STATUS_TIMED_OUT, toolCallId, STATUS_PENDING, profile, sessionId)
    return Number(result.changes)
  }

  /** 按对话 ID 列表软删除消息 */
  markDeletedByConversations(convIds: string[], profile: string, sessionId: string): number {
    if (convIds.length === 0) {
      return 0
    }
    const db = getDatabase()
    const placeholders = convIds.map(() => '?').join(',')
    const result = db
      .prepare(
        `UPDATE messages SET deleted = 1
         WHERE conversation_id IN (${placeholders})
           AND profile = ? AND session_id = ?`
      )
      .run(...convIds, profile, sessionId)
    return Number(result.changes)
  }

  /** 根据消息 ID 查找所属会话 ID */
  findSessionIdByMessageId(messageId: number, profile: string): string | null {
    const db = getDatabase()
    const row = db
      .prepare(`SELECT m.session_id FROM messages m WHERE m.id = ? AND m.profile = ?`)
      .get(messageId, profile) as { session_id: string } | undefined
    return row?.session_id ?? null
  }
}
