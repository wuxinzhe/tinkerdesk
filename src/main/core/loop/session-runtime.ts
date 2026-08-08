/**
 * session-runtime.ts — 会话级活跃状态容器（OO 化拆分）
 *
 * 一个会话的运行时状态内聚于此（TinkerAgent 瘦身：不再直接持有队列/中断控制）：
 * - 消息队列（串行处理）
 * - 中断控制（AbortController）
 * - 生命周期：interrupt / clear / dispose（幂等）
 *
 * 生命周期 = 会话活跃期；dispose 后即被 Agent 聚合根丢弃。
 */
import { MessageQueueStore } from '../../service/message-queue-store'

/** 会话级运行时状态 */
export class SessionRuntime {
  /** 用户消息队列（per-session 串行处理） */
  readonly queue = new MessageQueueStore()
  /** 中断控制（对话进行中注册，结束/中断清除） */
  private abortController: AbortController | null = null

  constructor(
    /** 会话 id */
    readonly sessionId: string,
    /** 用户 profile */
    readonly profile: string
  ) { }

  /** 注册中断控制（一轮对话开始） */
  setAbort(abort: AbortController): void {
    this.abortController = abort
  }

  /** 取中断控制（无进行中对话返回 null） */
  getAbort(): AbortController | null {
    return this.abortController
  }

  /** 清除中断控制（对话正常结束） */
  clearAbort(): void {
    this.abortController = null
  }

  /** 中断对话（无进行中对话返回 false） */
  interrupt(): boolean {
    const abort = this.abortController
    if (!abort) {
      console.warn(`中断失败：会话 ${this.sessionId} 无进行中的对话`)
      return false
    }
    abort.abort()
    this.abortController = null
    console.log(`action=INTERRUPT sessionId=${this.sessionId}`)
    return true
  }

  /** 清空队列 + 处理锁（中断/清空用） */
  clearQueue(): void {
    this.queue.clearQueue(this.sessionId)
    this.queue.setProcessing(this.sessionId, false)
  }

  /** 释放（幂等）：清队列/处理锁/中断 */
  dispose(): void {
    this.abortController?.abort()
    this.abortController = null
    this.clearQueue()
    console.log(`action=SESSION-RUNTIME-DISPOSE sessionId=${this.sessionId}`)
  }
}
