/**
 * strategies/queue-strategy.ts — 排队模式（现状行为封装——默认）
 *
 * 新消息 → 入队（现有 MessageQueueStore）——当前回合正常跑完——再消费。
 * loop 不主动 abort——退出即结束——无衔接。
 */
import { BUSY_MODE_QUEUE } from '../types'
import type { BusyModeStrategy, BusyStrategyHost, BusyLoopHost } from '../types'

export class QueueStrategy implements BusyModeStrategy {
  readonly mode = BUSY_MODE_QUEUE

  onNewMessage(runtime: BusyStrategyHost, text: string): void {
    // 排队由 tinker-agent 的消息入口处理（enqueueMessage）——策略无需额外动作
    void runtime
    void text
  }

  async onLoopInterrupted(host: BusyLoopHost): Promise<boolean> {
    // 排队模式正常不 abort——若被外部中断（手动停止）→ 退出
    void host
    return false
  }

  nextTurnMessage(): string | null {
    return null
  }
}
