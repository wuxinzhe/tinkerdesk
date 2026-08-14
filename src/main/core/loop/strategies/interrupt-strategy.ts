/**
 * strategies/interrupt-strategy.ts — Interrupt mode
 *
 * New message → interrupt the current turn (immediate abort mid-LLM-stream;
 * during tool execution mark it — the turn exits at a safe boundary after
 * the tool finishes) — run returns with the new message → tinker-agent
 * starts a fresh turn immediately.
 * Flushes in-memory messages to DB before exiting (otherwise the new turn's
 * history read would lose conversation messages).
 */
import { BUSY_MODE_INTERRUPT } from '../types'
import type { BusyModeStrategy, BusyStrategyHost, BusyLoopHost } from '../types'

export class InterruptStrategy implements BusyModeStrategy {
  readonly mode = BUSY_MODE_INTERRUPT
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
