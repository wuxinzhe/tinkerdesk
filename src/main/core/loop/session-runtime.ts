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
  /** 重定向挂起的修正文本（redirect 模式） */
  private pendingRedirect: string | null = null
  /** 打断模式挂起的新消息（interrupt 模式） */
  private pendingInterrupt: string | null = null
  /** 语音打断待处理标记（工具执行中挂——工具完成后强制 abort 回合——说完的消息转 pendingInterrupt） */
  private pendingBarge = false
  /** 是否在工具执行中（决定 abort 时机） */
  private executingTools = false

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

  // ═══════════ 忙碌模式策略支持（redirect/interrupt） ═══════════

  /** 重定向：挂起修正文本 + abort（LLM 流中断；工具执行中不 abort——等安全边界） */
  requestRedirect(text: string): void {
    this.pendingRedirect = this.pendingRedirect ? `${this.pendingRedirect}\n${text}` : text
    // 工具执行中不 abort——工具完成后循环回顶注入（对齐 Hermes：不杀工具）
    if (!this.executingTools) {
      this.abortController?.abort()
    }
    console.log(`action=REDIRECT sessionId=${this.sessionId}`)
  }

  /** 打断：挂起新消息 + abort（LLM 流中立即；工具执行中标记——工具完成后 abort） */
  requestInterrupt(text: string): void {
    this.pendingInterrupt = text
    if (this.executingTools) {
      // 工具执行中——等工具完成（工具完成后 conversation 检查 pendingInterrupt 再 abort）
      console.log(`action=INTERRUPT-AFTER-TOOLS sessionId=${this.sessionId}`)
    } else {
      this.abortController?.abort()
    }
    console.log(`action=INTERRUPT-NEW sessionId=${this.sessionId}`)
  }

  /**
   * 语音打断：纯 abort（不挂 pendingInterrupt——说完再发完整文本）
   * 对齐语音方案 P0-A：按住说话 → 先断当前回复 → 说完 STT 完整文本 → 空闲入队
   * 工具执行中：挂 pendingBarge 标记——工具完成后强制 abort 回合
   * （否则长工具序列 executingTools 一直 true——打断永远等不到——回合不退）
   */
  interruptNoPending(): void {
    if (this.executingTools) {
      this.pendingBarge = true
      console.log(`action=VOICE-INTERRUPT-AFTER-TOOLS sessionId=${this.sessionId}`)
      return
    }
    this.abortController?.abort()
    console.log(`action=VOICE-INTERRUPT sessionId=${this.sessionId}`)
  }

  /** 取走待打断标记（工具完成后 conversation 检查——true 则 abort 回合） */
  takePendingBarge(): boolean {
    const p = this.pendingBarge
    this.pendingBarge = false
    return p
  }

  /**
   * VAD 打断退出前：挂起的 redirect 修正转 pendingInterrupt（合并）
   * 说完的话作为新回合处理——而非 redirect 注入重试（模型可能继续原命令）
   */
  bargeToInterrupt(): void {
    if (this.pendingRedirect) {
      this.pendingInterrupt = this.pendingInterrupt
        ? `${this.pendingInterrupt}\n${this.pendingRedirect}`
        : this.pendingRedirect
      this.pendingRedirect = null
    }
  }

  /** 取走挂起的重定向修正（redirect 注入用——无则 null） */
  takePendingRedirect(): string | null {
    const p = this.pendingRedirect
    this.pendingRedirect = null
    return p
  }

  /** 取走挂起的打断消息（interrupt 起新回合用——无则 null） */
  takePendingInterrupt(): string | null {
    const p = this.pendingInterrupt
    this.pendingInterrupt = null
    return p
  }

  /** 是否有挂起的打断消息 */
  hasPendingInterrupt(): boolean {
    return this.pendingInterrupt !== null
  }

  /** 标记工具执行状态（conversation 工具执行开始/结束调用） */
  setExecutingTools(executing: boolean): void {
    this.executingTools = executing
  }

  /** 当前是否在工具执行中 */
  isExecutingTools(): boolean {
    return this.executingTools
  }

  /** 清理忙碌模式挂起状态（回合结束/中断收尾——pendingInterrupt 保留给 processLoop 消费） */
  clearBusyState(): void {
    this.pendingRedirect = null
    this.executingTools = false
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
