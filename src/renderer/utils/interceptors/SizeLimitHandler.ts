/**
 * SizeLimitHandler.ts — 限尺寸处理器
 *
 * 适用于 approval_response、revoke、interrupt 等控制类轻量通道。
 * 超限即拒绝 + 弹窗，无分片。
 * 这些通道的固定数据在正常使用中不可能超限，超限必为恶意注入。
 */

import type { MessageHandler, OutgoingMessage } from './InterceptionPipeline'
import { showErrorToast } from '@/renderer/utils/notification-utils'

export interface SizeLimitHandlerOptions {
  /** 允许的最大字节数 */
  maxAllowed: number
}

export class SizeLimitHandler implements MessageHandler {
  private maxAllowed: number

  constructor(options: SizeLimitHandlerOptions) {
    this.maxAllowed = options.maxAllowed
  }

  handle(msg: OutgoingMessage, next: (m: Record<string, unknown>) => void): void {
    const size = new Blob([JSON.stringify(msg)]).size

    if (size <= this.maxAllowed) {
      next(msg)
      return
    }

    showErrorToast({
      code: 'MSG_TOO_LARGE',
      message: `消息体过大（${size} bytes），${this.maxAllowed} bytes 以内允许发送。`
        + `请检查是否有异常注入。`
    })
  }
}
