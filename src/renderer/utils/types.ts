/**
 * renderer/utils/types.ts — 工具函数包类型定义
 *
 * 各工具的类型统一归位（ErrorType/ErrorRecord/LogLevel），
 * 实现文件从本文件导入。
 */

/** 错误类型分类 */
export type ErrorType = 'crash' | 'unhandledrejection' | 'api' | 'unknown'

/** 错误记录条目 */
export interface ErrorRecord {
  id: string
  timestamp: string
  type: ErrorType
  message: string
  stack?: string
  /** 发生错误时的页面 URL */
  url?: string
  /** 附加元信息（版本、userId 等） */
  meta?: Record<string, string>
  /** 用户是否已同意上报 */
  consented: boolean
}

/** 日志级别 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
