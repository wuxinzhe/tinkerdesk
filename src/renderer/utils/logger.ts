/**
 * logger.ts — 分级日志工具
 *
 * 用法：
 *   import { log } from '@/renderer/utils/logger'
 *   log.info('Auth', '用户登录成功', userId)
 *   log.debug('WS', '收到消息', msgId)
 *
 * 开关：
 *   - 开发环境默认开启（VITE_DEBUG=true 或 localStorage debug_mode=true）
 *   - Ctrl+Shift+D 切换
 *   - log.setEnabled(false) / log.setLevel('warn') 编程控制
 */

import type { LogLevel } from '@/defines/utils/log-types'

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: 'D',
  info: 'I',
  warn: 'W',
  error: 'E',
}

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: '#888',
  info: '#0af',
  warn: '#fa0',
  error: '#f33',
}

class Logger {
  private _enabled: boolean
  private _level: LogLevel = 'debug'

  constructor() {
    // 优先读 localStorage，降级到 VITE_DEBUG 环境变量
    const stored = localStorage.getItem('debug_mode')
    if (stored !== null) {
      this._enabled = stored === 'true'
    } else {
      this._enabled = import.meta.env.VITE_DEBUG === 'true' || import.meta.env.DEV
    }
    this._level = (localStorage.getItem('log_level') as LogLevel) || 'debug'
  }

  get enabled(): boolean {
    return this._enabled
  }

  setEnabled(v: boolean) {
    this._enabled = v
    localStorage.setItem('debug_mode', String(v))
  }

  get level(): LogLevel {
    return this._level
  }

  setLevel(level: LogLevel) {
    this._level = level
    localStorage.setItem('log_level', level)
  }

  toggle() {
    this.setEnabled(!this._enabled)
    // 切换时主动输出一条，让用户感知状态变化
    if (this._enabled) {
      this.info('Logger', '调试模式已开启')
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this._enabled && LEVEL_RANK[level] >= LEVEL_RANK[this._level]
  }

  private print(level: LogLevel, tag: string, ...args: unknown[]) {
    if (!this.shouldLog(level)) return

    const ts = new Date().toISOString().slice(11, 23)
    const label = LEVEL_LABEL[level]
    const color = LEVEL_COLOR[level]

    const prefix = `%c[${ts}][${label}][${tag}]`
    const style = `color:${color};font-weight:600`

    switch (level) {
      case 'error':
        console.error(prefix, style, ...args)
        break
      case 'warn':
        console.warn(prefix, style, ...args)
        break
      default:
        console.log(prefix, style, ...args)
    }
  }

  debug(tag: string, ...args: unknown[]) {
    this.print('debug', tag, ...args)
  }

  info(tag: string, ...args: unknown[]) {
    this.print('info', tag, ...args)
  }

  warn(tag: string, ...args: unknown[]) {
    this.print('warn', tag, ...args)
  }

  error(tag: string, ...args: unknown[]) {
    this.print('error', tag, ...args)
  }
}

/** 全局单例 */
export const log = new Logger()
