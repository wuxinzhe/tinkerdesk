/**
 * message-queue-store.ts — 用户消息队列存储
 *
 * 复刻 tinker-agent IMessageQueueStore（本地版，内存实现）：
 * per-session 消息队列 + processing 标志。
 * - enqueueMessage：消息入队
 * - dequeueAll / dequeueBatch / peekAll：取消息（预算驱动）
 * - removeFromQueue：撤回（按消息 id）
 * - isProcessing / setProcessing：会话处理状态
 * - clearQueue：中断清队
 */
import type { UserMessageQueueItem } from './types'
export type { UserMessageQueueItem } from './types'

/** 消息队列存储（内存实现，per-session） */
export class MessageQueueStore {
  /** sessionId → 消息队列 */
  private readonly queues = new Map<string, UserMessageQueueItem[]>()
  /** sessionId → 处理中标志 */
  private readonly processing = new Map<string, boolean>()
  /** 消息 id 计数器 */
  private idCounter = 0

  /** 消息入队（返回队列条目） */
  enqueueMessage(sessionId: string, content: string, profile: string): UserMessageQueueItem {
    const item: UserMessageQueueItem = {
      id: `msg_${Date.now()}_${++this.idCounter}`,
      content,
      profile,
    }
    let queue = this.queues.get(sessionId)
    if (!queue) {
      queue = []
      this.queues.set(sessionId, queue)
    }
    queue.push(item)
    return item
  }

  /** 取出全部消息（清空队列） */
  dequeueAll(sessionId: string): UserMessageQueueItem[] {
    const queue = this.queues.get(sessionId) ?? []
    this.queues.delete(sessionId)
    return queue
  }

  /** 查看全部消息（不清空） */
  peekAll(sessionId: string): UserMessageQueueItem[] {
    return [...(this.queues.get(sessionId) ?? [])]
  }

  /** 取出前 N 条消息 */
  dequeueBatch(sessionId: string, count: number): UserMessageQueueItem[] {
    const queue = this.queues.get(sessionId)
    if (!queue || queue.length === 0) return []
    const taken = queue.splice(0, count)
    if (queue.length === 0) {
      this.queues.delete(sessionId)
    }
    return taken
  }

  /** 从队列移除指定消息（撤回未处理的消息） */
  removeFromQueue(sessionId: string, messageId: string): boolean {
    const queue = this.queues.get(sessionId)
    if (!queue) return false
    const idx = queue.findIndex((m) => m.id === messageId)
    if (idx < 0) return false
    queue.splice(idx, 1)
    if (queue.length === 0) {
      this.queues.delete(sessionId)
    }
    return true
  }

  /** 会话是否处理中 */
  isProcessing(sessionId: string): boolean {
    return this.processing.get(sessionId) === true
  }

  /** 设置会话处理状态 */
  setProcessing(sessionId: string, processing: boolean): void {
    if (processing) {
      this.processing.set(sessionId, true)
    } else {
      this.processing.delete(sessionId)
    }
  }

  /** 清空队列 */
  clearQueue(sessionId: string): void {
    this.queues.delete(sessionId)
  }
}
