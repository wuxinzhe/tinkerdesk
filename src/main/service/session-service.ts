/**
 * session-service.ts — 会话服务层
 *
 * ISessionService (local single-user):
 * create / listSessions / updateTitle / findById / toggleYolo / browseRich.
 * DTO definitions centralized in ./types.ts.
 */
import { randomUUID } from 'crypto'
import type { MessageRepository } from '../repository/message-repository'
import { SessionRepository } from '../repository/session-repository'
import type { SessionEntity, SessionSummaryDTO } from '../repository/types'
import { nowDb } from '../utils/time'
import type { DiscoverHitDTO, ReadResultDTO, ScrollResultDTO } from './types'

/** 会话服务 */
export class SessionService {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly messageRepo?: MessageRepository
  ) { }

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
      reasoningDepth: 'medium',
      notifyOnComplete: false,
    }
    this.sessionRepo.save(entity)
    return entity
  }

  /** 分页查询会话列表 */
  listSessions(profile: string, limit = 50, offset = 0): SessionEntity[] {
    return this.sessionRepo.findByUser(profile, limit, offset)
  }

  /** 更新会话标题 */
  updateTitle(sessionId: string, title: string, profile: string): void {
    const session = this.sessionRepo.findById(sessionId, profile)
    if (!session) {
      return
    }
    session.title = title
    this.sessionRepo.save(session)
  }

  /** 更新推理深度（per-session——'' / low / medium / high） */
  updateReasoningDepth(sessionId: string, reasoningDepth: string, profile: string): boolean {
    const session = this.sessionRepo.findById(sessionId, profile)
    if (!session) {
      return false
    }
    session.reasoningDepth = reasoningDepth
    this.sessionRepo.save(session)
    return true
  }

  /** 更新回复提醒（per-session——对话完成时播放提醒音效） */
  updateNotifyOnComplete(sessionId: string, enabled: boolean, profile: string): boolean {
    return this.sessionRepo.updateNotifyOnComplete(sessionId, profile, enabled)
  }

  /** 按 ID 查找会话（profile 限定） */
  findById(sessionId: string, profile: string): SessionEntity | null {
    return this.sessionRepo.findById(sessionId, profile)
  }

  /** 按 id 查（不限定 profile——OO 化实例装配用：从 session 记录反查 profile） */
  findByIdAnyProfile(sessionId: string): SessionEntity | null {
    return this.sessionRepo.findByIdAnyProfile(sessionId)
  }

  /** 切换 YOLO 模式 */
  toggleYolo(sessionId: string, profile: string): boolean {
    return this.sessionRepo.toggleYolo(sessionId, profile)
  }

  /** 浏览会话摘要列表 */
  browseRich(limit: number, excludeSessionId: string, profile: string): SessionSummaryDTO[] {
    return this.sessionRepo.browseRich(profile, excludeSessionId, limit)
  }

  /** 更新会话 token 统计（累计，profile 限定） */
  accumulateTokens(
    sessionId: string,
    profile: string,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens: number,
    cacheWriteTokens: number,
    durationMs = 0,
    iterationCount = 0,
    llmRequestCount = 0,
    currentContextTokens?: number
  ): void {
    const session = this.sessionRepo.findById(sessionId, profile)
    if (!session) {
      return
    }
    session.inputTokens += inputTokens
    session.outputTokens += outputTokens
    session.cacheReadTokens += cacheReadTokens
    session.cacheWriteTokens += cacheWriteTokens
    session.totalDurationMs = (session.totalDurationMs ?? 0) + durationMs
    session.totalIterations = (session.totalIterations ?? 0) + iterationCount
    session.totalLlmRequests = (session.totalLlmRequests ?? 0) + llmRequestCount
    // 当前上下文总量（冗余——最新一轮，直接覆盖）
    if (currentContextTokens !== undefined) {
      session.currentContextTokens = currentContextTokens
    }
    session.messageCount += 1
    this.sessionRepo.save(session)
  }

  // ── 会话搜索（session_search 工具用，本地 LIKE 实现） ──

  /** 标题精确匹配 */
  matchSessionTitle(query: string, profile: string): DiscoverHitDTO | null {
    const session = this.sessionRepo.findByTitleLike(query, profile)
    if (!session) return null
    return {
      sessionId: session.id,
      when: '',
      source: 'local',
      title: session.title,
      matchedRole: '',
      matchMessageId: 0,
      snippet: '',
      bookendStart: [],
      messages: [],
      bookendEnd: [],
      messagesBefore: 0,
      messagesAfter: 0,
    }
  }

  /**
   * 全文搜索命中：
   * 标题 LIKE 匹配 + 消息内容 LIKE 匹配合并，role 过滤 + profile 限定。
   */
  discoverHits(query: string, limit: number, roleFilter: string | null, sort: string | null, profile: string): DiscoverHitDTO[] {
    // 标题匹配（本地实现：标题 LIKE）
    const sessions = this.sessionRepo.findByTitleLikeAll(query, profile, limit)
    const titleHits = sessions.map((s) => ({
      sessionId: s.id,
      when: '',
      source: 'local',
      title: s.title,
      matchedRole: '',
      matchMessageId: 0,
      snippet: '',
      bookendStart: [],
      messages: [],
      bookendEnd: [],
      messagesBefore: 0,
      messagesAfter: 0,
    }))

    // 消息内容匹配
    if (this.messageRepo) {
      const roles = roleFilter
        ? roleFilter.split(',').map((r) => r.trim()).filter((r) => r.length > 0)
        : ['user', 'assistant']
      const contentHits = this.messageRepo.discoverHits(query, roles, sort, profile, limit)
      // 合并：标题命中优先，内容命中去重后追加
      const seen = new Set(titleHits.map((h) => h.sessionId))
      for (const hit of contentHits) {
        if (seen.has(hit.sessionId)) continue
        seen.add(hit.sessionId)
        titleHits.push({
          sessionId: hit.sessionId,
          when: hit.when,
          source: 'local',
          title: hit.title,
          matchedRole: hit.matchedRole,
          matchMessageId: hit.id,
          snippet: hit.snippet,
          bookendStart: [],
          messages: [],
          bookendEnd: [],
          messagesBefore: 0,
          messagesAfter: 0,
        })
      }
    }
    return titleHits.slice(0, limit)
  }

  /** 读取会话 */
  readSession(sessionId: string, head: number, tail: number, profile: string): ReadResultDTO | null {
    const session = this.sessionRepo.findById(sessionId, profile)
    if (!session) {
      return null
    }
    // 简化：读取全部消息（本地量小），标记 truncated
    const messages = this.messageRepo?.listAllBySession(sessionId, profile) ?? []
    const total = messages.length
    const truncated = total > head + tail
    const selected = truncated ? [...messages.slice(0, head), ...messages.slice(total - tail)] : messages
    return {
      sessionId,
      source: 'local',
      title: session.title,
      when: '',
      messageCount: total,
      truncated,
      messages: selected.map((m) => ({ id: m.id ?? 0, role: m.role, content: m.content })),
    }
  }

  /** 解析 lineage 根（本地简化：自身即根） */
  resolveLineage(sessionId: string, _profile: string): string {
    return sessionId
  }

  /** 消息窗口滚动 */
  scrollWithCounts(sessionId: string, aroundId: number, window: number, profile: string): ScrollResultDTO {
    const all = this.messageRepo?.listAllBySession(sessionId, profile) ?? []
    const idx = all.findIndex((m) => m.id === aroundId)
    if (idx === -1) {
      return { window: [], messagesBefore: 0, messagesAfter: 0 }
    }
    const start = Math.max(0, idx - window)
    const end = Math.min(all.length, idx + window + 1)
    return {
      window: all.slice(start, end).map((m) => ({ id: m.id ?? 0, role: m.role, content: m.content })),
      messagesBefore: idx,
      messagesAfter: all.length - idx - 1,
    }
  }

  /** scroll rebind（本地无子 session，直接返回空） */
  scrollRebind(_sessionId: string, _aroundId: number, _window: number, _profile: string): ScrollResultDTO {
    return { window: [], messagesBefore: 0, messagesAfter: 0 }
  }
}
