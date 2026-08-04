/**
 * session-service.ts — 会话服务层
 *
 * 复刻 showing-agent ISessionService（本地单用户版）：
 * create / listSessions / updateTitle / findById / toggleYolo / browseRich。
 */
import {randomUUID} from 'crypto'
import {SessionRepository} from '../db/session-repository'
import type {SessionEntity, SessionSummaryDTO} from '../db/session-repository'

/** 会话服务 */
export class SessionService {
  constructor(private readonly sessionRepo: SessionRepository) {}

  /** 创建会话 */
  create(profile: string, title = ''): SessionEntity {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
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
}
