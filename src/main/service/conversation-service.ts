/**
 * conversation-service.ts — 对话服务层
 *
 * 复刻 showing-agent IConversationService（本地单用户版）。
 */
import {ConversationRepository} from '../db/conversation-repository'
import type {ConversationEntity, ConversationStatusUpdate} from '../db/conversation-repository'

/** 对话服务 */
export class ConversationService {
  constructor(private readonly conversationRepo: ConversationRepository) {}

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
