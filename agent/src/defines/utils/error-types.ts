/**
 * error-types.ts — 错误收集类型定义
 *
 * 从 src/renderer/utils/error-reporter.ts 提取。
 */

export type ErrorType = 'crash' | 'unhandledrejection' | 'api' | 'unknown'

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
