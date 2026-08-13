/**
 * busy-mode.ts — 忙碌时消息处置策略抽象（queue 排队 / redirect 重定向 / interrupt 打断）
 *
 * 三种模式并存——用户通过 agent-config 的 messageBusyMode 选择——
 * AgentLoop 构建时读一次（回合内固定——中途修改下一轮生效）。
 *
 * 策略职责（每个策略独立类——行为内聚——未来加新模式只新增一个类 + registry 注册）：
 *   onNewMessage      新消息到达（run 进行中）——如何处置
 *   onLoopInterrupted loop 被 abort 后的处置——返回 true 继续循环 / false 退出
 *   nextTurnMessage   run 结束后要立即开启新回合的消息（interrupt 用）
 *   onRunExit         run 退出前的收尾（interrupt 用——flush 内存消息）
 */
import type { BusyMode } from './types'

/** 忙碌时消息处置策略接口 */
export interface BusyModeStrategy {
  readonly mode: BusyMode

  /** 新消息到达（run 进行中）——策略决定如何处置 */
  onNewMessage(runtime: BusyStrategyHost, text: string): void

  /**
   * loop 被 abort 后的处置
   * @returns true = 继续循环（redirect 注入后重试）；false = 退出循环
   */
  onLoopInterrupted(host: BusyLoopHost): Promise<boolean>

  /** run 结束后的衔接——返回要立即处理的新消息（interrupt 用）；无则 null */
  nextTurnMessage(): string | null

  /** run 退出前的收尾（interrupt 用——flush 内存消息到 DB） */
  onRunExit?(host: BusyLoopHost): Promise<void>
}

/** 策略宿主：session-runtime 暴露给策略的最小面（注入依赖——避免循环引用） */
export interface BusyStrategyHost {
  /** 挂起重定向修正（redirect 用） */
  requestRedirect(text: string): void
  /** 挂起打断（interrupt 用——立即 abort 或等工具完成） */
  requestInterrupt(text: string): void
  /** 当前是否在工具执行中（决定 abort 时机） */
  isExecutingTools(): boolean
}

/** 策略宿主：conversation 暴露给策略的最小面（注入依赖——避免循环引用） */
export interface BusyLoopHost {
  /** 取走挂起的修正文本（redirect 用——无则 null） */
  takePendingRedirect(): string | null
  /** 注入修正并重建 abort（redirect 用——返回后继续循环） */
  applyActiveTurnRedirect(pending: string): Promise<void>
  /** 重建 AbortController（redirect 继续循环前） */
  resetAbort(): void
  /** flush 内存消息到 DB（interrupt 退出前） */
  flushPendingMessagesToDb(): Promise<void>
}
