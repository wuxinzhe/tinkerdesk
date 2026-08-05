/**
 * session-service.ts — 会话服务层
 *
 * 复刻 showing-agent ISessionService（本地单用户版）：
 * create / listSessions / updateTitle / findById / toggleYolo / browseRich。
 */
import {randomUUID} from 'crypto'
import {SessionRepository} from '../repository/session-repository'
import type {SessionEntity, SessionSummaryDTO} from '../repository/types'
import type {MessageRepository} from '../repository/message-repository'
import {nowDb, nowIso, nowTs, todayDate} from '../utils/time'

/** 会话服务 */
export class SessionService {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly messageRepo?: MessageRepository
  ) {}

  /** 创建会话 */
  create(profile: string, title = ''): SessionEntity {
    const now = nowDb()
    const entity: SessionEntity = {
      id: randomUUID(),
      profile,
      source: 'local',
      systemPrompt: '',
      parentSessionId: null,
      title,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCostUsd: 0,
      messageCount: 0,
      toolCallCount: 0,
      rewindCount: 0,
      startedAt: now,
      archived: false,
      yolo: false,
    }
    this.sessionRepo.save(entity)
    return entity
  }

  /** 分页查询会话列表 */
  listSessions(profile: string, limit = 50, offset = 0): SessionEntity[] {
    return this.sessionRepo.findByUser(profile, limit, offset)
  }

  /** 更新会话标题 */
  updateTitle(sessionId: string, title: string): void {
    const session = this.sessionRepo.findById(sessionId)
    if (!session) {
      return
    }
    session.title = title
    this.sessionRepo.save(session)
  }

  /** 按 ID 查找会话 */
  findById(sessionId: string): SessionEntity | null {
    return this.sessionRepo.findById(sessionId)
  }

  /** 切换 YOLO 模式 */
  toggleYolo(sessionId: string, profile: string): boolean {
    return this.sessionRepo.toggleYolo(sessionId, profile)
  }

  /** 浏览会话摘要列表 */
  browseRich(limit: number, excludeSessionId: string, profile: string): SessionSummaryDTO[] {
    return this.sessionRepo.browseRich(profile, excludeSessionId, limit)
  }

  /** 更新会话 token 统计（累计） */
  accumulateTokens(
    sessionId: string,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens: number,
    cacheWriteTokens: number
  ): void {
    const session = this.sessionRepo.findById(sessionId)
    if (!session) {
      return
    }
    session.inputTokens += inputTokens
    session.outputTokens += outputTokens
    session.cacheReadTokens += cacheReadTokens
    session.cacheWriteTokens += cacheWriteTokens
    session.messageCount += 1
    this.sessionRepo.save(session)
  }

  // ── 会话搜索（session_search 工具用，本地 LIKE 实现） ──

  /** 标题精确匹配（DISCOVER 模式第 1 步） */
  matchSessionTitle(query: string, profile: string): {sessionId: string; title: string} | null {
    const session = this.sessionRepo.findByTitleLike(query, profile)
    return session ? {sessionId: session.id, title: session.title} : null
  }

  /** 全文搜索命中（DISCOVER 模式第 2 步，标题 LIKE 匹配） */
  discoverHits(query: string, limit: number, _roleFilter: string | null, _sort: string | null, profile: string): Array<{sessionId: string; title: string; snippet: string}> {
    const sessions = this.sessionRepo.findByTitleLikeAll(query, profile, limit)
    return sessions.map((s) => ({sessionId: s.id, title: s.title, snippet: ''}))
  }

  /** 读取会话（READ 模式：前 N + 后 M 条） */
  readSession(sessionId: string, head: number, tail: number, _profile: string): {sessionId: string; title: string; messageCount: number; truncated: boolean; messages: Array<{id: number; role: string; content: string}>} | null {
    const session = this.sessionRepo.findById(sessionId)
    if (!session) {
      return null
    }
    // 简化：读取全部消息（本地量小），标记 truncated
    const messages = this.messageRepo?.listAllBySession(sessionId) ?? []
    const total = messages.length
    const truncated = total > head + tail
    const selected = truncated ? [...messages.slice(0, head), ...messages.slice(total - tail)] : messages
    return {
      sessionId,
      title: session.title,
      messageCount: total,
      truncated,
      messages: selected.map((m) => ({id: m.id ?? 0, role: m.role, content: m.content})),
    }
  }

  /** 解析 lineage 根（本地简化：自身即根） */
  resolveLineage(sessionId: string, _profile: string): string {
    return sessionId
  }

  /** 消息窗口滚动（SCROLL 模式：around id ± window） */
  scrollWithCounts(sessionId: string, aroundId: number, window: number, _profile: string): {window: Array<{id: number; role: string; content: string}>; messagesBefore: number; messagesAfter: number} {
    const all = this.messageRepo?.listAllBySession(sessionId) ?? []
    const idx = all.findIndex((m) => m.id === aroundId)
    if (idx === -1) {
      return {window: [], messagesBefore: 0, messagesAfter: 0}
    }
    const start = Math.max(0, idx - window)
    const end = Math.min(all.length, idx + window + 1)
    return {
      window: all.slice(start, end).map((m) => ({id: m.id ?? 0, role: m.role, content: m.content})),
      messagesBefore: idx,
      messagesAfter: all.length - idx - 1,
    }
  }

  /** scroll rebind（本地无子 session，直接返回空） */
  scrollRebind(_sessionId: string, _aroundId: number, _window: number, _profile: string): {window: Array<{id: number; role: string; content: string}>; messagesBefore: number; messagesAfter: number} {
    return {window: [], messagesBefore: 0, messagesAfter: 0}
  }
}
