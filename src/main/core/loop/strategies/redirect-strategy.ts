/**
 * strategies/redirect-strategy.ts — Redirect mode
 *
 * New message → suspend the correction + abort (only breaks the LLM stream —
 * no abort during tool execution — waits for a safe boundary).
 * Loop interrupted → take correction → inject (applyActiveTurnRedirect) →
 * rebuild abort → continue the loop and retry.
 */
import { BUSY_MODE_REDIRECT } from '../types'
import type { BusyModeStrategy, BusyStrategyHost, BusyLoopHost } from '../types'

export class RedirectStrategy implements BusyModeStrategy {
  readonly mode = BUSY_MODE_REDIRECT

  onNewMessage(runtime: BusyStrategyHost, text: string): void {
    runtime.requestRedirect(text)
  }

  async onLoopInterrupted(host: BusyLoopHost): Promise<boolean> {
    const pending = host.takePendingRedirect()
    if (!pending) return false // 无挂起修正（手动停止）→ 退出
    await host.applyActiveTurnRedirect(pending)
    host.resetAbort()
    return true // 继续循环 → 模型看到修正重试
  }

  nextTurnMessage(): string | null {
    return null
  }
}
