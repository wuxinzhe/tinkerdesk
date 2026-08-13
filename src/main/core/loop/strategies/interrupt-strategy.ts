/**
 * strategies/interrupt-strategy.ts — 打断模式
 *
 * 新消息 → 中断当前回合（LLM 流中立即 abort；工具执行中标记——工具跑完
 * 在安全边界退出）——run 退出后带回新消息 → tinker-agent 立即起新回合。
 * 退出前 flush 内存消息到 DB（否则新回合读历史时对话消息丢失）。
 */
import type { BusyModeStrategy, BusyStrategyHost, BusyLoopHost } from '../busy-mode'

export class InterruptStrategy implements BusyModeStrategy {
  readonly mode = 'interrupt' as const
  private nextTurn: string | null = null

  onNewMessage(runtime: BusyStrategyHost, text: string): void {
    runtime.requestInterrupt(text)
  }

  async onLoopInterrupted(host: BusyLoopHost): Promise<boolean> {
    void host
    return false // 退出循环（不注入重试）
  }

  nextTurnMessage(): string | null {
    return this.nextTurn
  }

  /** 记录要立即开启新回合的消息（由 conversation 在退出时写入） */
  setNextTurn(text: string): void {
    this.nextTurn = text
  }

  async onRunExit(host: BusyLoopHost): Promise<void> {
    // flush 内存消息到 DB——否则新回合开始时这些对话消息丢失
    await host.flushPendingMessagesToDb()
  }
}
