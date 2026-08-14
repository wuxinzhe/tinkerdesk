/**
 * conversation-service.ts — 对话服务层
 *
 * IConversationService (local single-user).
 */
import { randomUUID } from 'crypto'
import { CONV_IN_PROGRESS } from '../core/loop/types'
import { ConversationRepository } from '../repository/conversation-repository'
import type { ConversationEntity, ConversationStatusUpdate } from '../repository/types'
import { nowDb } from '../utils/time'

/** 对话服务 */
export class ConversationService {
  constructor(private readonly conversationRepo: ConversationRepository) { }

  /**
   * 新建对话周期：生成 convId + 默认字段 + 落库，返回实体。
   * 大部分字段为默认值，仅 sessionId 为入参。
   */
  startConversation(sessionId: string): ConversationEntity {
    const entity: ConversationEntity = {
      id: randomUUID(),
      sessionId,
      status: CONV_IN_PROGRESS,
      messageCount: 0,
      estimatedTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      startedAt: nowDb(),
      completedAt: null,
    }
    this.conversationRepo.save(entity)
    return entity
  }

  /** 按 ID 查找对话 */
  findById(id: string): ConversationEntity | null {
    return this.conversationRepo.findById(id)
  }

  /** 查找会话进行中的对话 */
  findInProgress(sessionId: string): ConversationEntity | null {
    return this.conversationRepo.findInProgress(sessionId)
  }

  /** 更新对话状态及统计 */
  updateStatus(id: string, sessionId: string, status: string, update?: ConversationStatusUpdate): number {
    return this.conversationRepo.updateStatus(id, sessionId, status, update)
  }

  /** 批量更新对话状态（压缩用） */
  batchUpdateStatus(sessionId: string, ids: string[], status: string): number {
    return this.conversationRepo.batchUpdateStatus(sessionId, ids, status)
  }

  /** 是否存在进行中的对话 */
  hasInProgressConversation(profile: string): boolean {
    return this.conversationRepo.hasInProgressConversation(profile)
  }

  /** 找出需要压缩的对话 ID */
  findCompressConvIds(sessionId: string, tailTokenBudget: number): string[] {
    return this.conversationRepo.findCompressConvIds(sessionId, tailTokenBudget)
  }

  /** 保存对话（新建周期时调用） */
  save(entity: ConversationEntity): void {
    this.conversationRepo.save(entity)
  }
}
