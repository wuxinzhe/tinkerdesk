/**
 * strategies/redirect-strategy.ts — 重定向模式
 *
 * 新消息 → 挂起修正 + abort（只断 LLM 流——工具执行中不 abort——等安全边界）。
 * loop 被中断 → 取修正 → 注入（applyActiveTurnRedirect）→ 重建 abort → 继续循环重试。
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
