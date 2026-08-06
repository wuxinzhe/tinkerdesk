/**
 * error-reporter.ts — 前端错误收集与上报
 *
 * 设计：
 *   1. window.onerror / unhandledrejection 自动捕获 → 入队 localStorage
 *   2. 首次捕获时弹 consent 对话框，用户同意后才标记可上报
 *   3. 队列上限 50 条，超出丢弃最早
 *   4. 服务端接口就绪后调 flush() 批量上报，上报后清队
 *
 * 存储格式（localStorage key: error_queue）：
 *   [{ id, timestamp, type, message, stack, url, meta, consented }]
 */

import { log } from './logger'
import type { ErrorRecord, ErrorType } from './types'

// ── 类型定义 ──

export type { ErrorRecord, ErrorType } from './types'

// ── 配置 ──

const STORAGE_KEY = 'error_queue'
const CONSENT_KEY = 'error_report_consent'
const MAX_QUEUE = 50

// ── 类 ──

class ErrorReporter {
  private _consented: boolean
  private _queue: ErrorRecord[] = []

  /** 待处理的 consent 回调队列（首次错误时触发） */
  private _pendingConsentCallbacks: Array<(v: boolean) => void> = []

  constructor() {
    this._consented = localStorage.getItem(CONSENT_KEY) === 'true'
    this._loadQueue()
  }

  // ── Consent ──

  get consented(): boolean {
    return this._consented
  }

  /**
   * 用户主动设置是否同意上报
   */
  setConsent(v: boolean) {
    this._consented = v
    localStorage.setItem(CONSENT_KEY, String(v))
    // 通知等待中的回调
    this._pendingConsentCallbacks.forEach(cb => cb(v))
    this._pendingConsentCallbacks = []
    // 如果同意，立即将队列中所有记录标记为 consented
    if (v) {
      this._queue.forEach(r => (r.consented = true))
      this._saveQueue()
    }
  }

  /**
   * 检查是否需要弹出 consent 询问
   * 首次捕获错误时调用，返回 true 表示需弹窗
   */
  get needsConsent(): boolean {
    return localStorage.getItem(CONSENT_KEY) === null
  }

  // ── 捕获 ──

  /**
   * 捕获一条错误记录
   * @returns 返回一个 promise，resolve 表示用户同意后可上报
   */
  capture(type: ErrorType, error: Error | string, meta?: Record<string, string>): void {
    const message = typeof error === 'string' ? error : error.message
    const record: ErrorRecord = {
      id: this._genId(),
      timestamp: new Date().toISOString(),
      type,
      message,
      stack: typeof error !== 'string' ? error.stack : undefined,
      url: window.location.href,
      meta: {
        ...meta,
        ua: navigator.userAgent.slice(0, 200),
      },
      consented: this._consented,
    }

    this._queue.push(record)
    if (this._queue.length > MAX_QUEUE) {
      this._queue.shift()
    }
    this._saveQueue()

    log.error('ErrorReporter', `[${type}]`, message)
  }

  // ── 队列 ──

  get queue(): ReadonlyArray<ErrorRecord> {
    return this._queue
  }

  get queueLength(): number {
    return this._queue.length
  }

  /** 清除队列 */
  clear() {
    this._queue = []
    localStorage.removeItem(STORAGE_KEY)
  }

  // ── 上报（服务端接口就绪后调用）──

  /**
   * 批量上报已获 consent 的错误
   * @param endpoint 服务端上报接口路径，默认 /error/report
   */
  async flush(baseUrl: string, endpoint = '/error/report'): Promise<void> {
    const batch = this._queue.filter(r => r.consented)
    if (batch.length === 0) return

    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errors: batch }),
      })
      if (res.ok) {
        // 上报成功后清队
        this._queue = this._queue.filter(r => !r.consented)
        this._saveQueue()
        log.info('ErrorReporter', `上报成功 ${batch.length} 条`)
      }
    } catch (e) {
      log.warn('ErrorReporter', '上报失败，下次重试', e)
    }
  }

  // ── 内部 ──

  private _genId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  }

  private _loadQueue() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) this._queue = JSON.parse(raw)
    } catch {
      this._queue = []
    }
  }

  private _saveQueue() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._queue))
  }
}

/** 全局单例 */
export const errorReporter = new ErrorReporter()
