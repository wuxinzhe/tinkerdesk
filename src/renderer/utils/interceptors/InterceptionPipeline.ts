/**
 * InterceptionPipeline.ts — 前端消息上传拦截器管线
 *
 * 在 ws-client.send() 和 STOMP publish 之间插入可扩展的拦截器链。
 * 每个 type 可注册一个 MessageHandler，按策略决定是否放行、分片或拒绝。
 *
 * 使用方式：
 *   const pipeline = new InterceptionPipeline()
 *   pipeline.use('user_message', new ChunkHandler({ maxDirect: 200*1024, maxAllowed: 1024*1024 }))
 *   pipeline.use('tool_result',  new ChunkHandler({ maxDirect: 200*1024, maxAllowed: 1024*1024 }))
 *   pipeline.use('approval_response', new SizeLimitHandler({ maxAllowed: 200*1024 }))
 *   pipeline.use('revoke',      new SizeLimitHandler({ maxAllowed: 200*1024 }))
 *
 *   // 在 ws-client.send 中调用
 *   pipeline.intercept(enrichedMsg, (finalMsg) => { client.publish({ ... }) })
 */
import { showErrorToast } from '@/renderer/utils/notification-utils'

// ── 类型定义 ──

export type PublishFn = (msg: Record<string, unknown>) => void

export interface OutgoingMessage extends Record<string, unknown> {
  type: string
}

export interface MessageHandler {
  handle(msg: OutgoingMessage, next: PublishFn): void
}

// ── 管线管理类 ──

export class InterceptionPipeline {
  private handlers = new Map<string, MessageHandler>()
  private fallback: MessageHandler | null = null

  /** 注册处理器，按 type 路由 */
  use(type: string, handler: MessageHandler): this {
    this.handlers.set(type, handler)
    return this
  }

  /** 设置兜底处理器（当 type 无匹配时） */
  setFallback(handler: MessageHandler): this {
    this.fallback = handler
    return this
  }

  /** 管线入口 */
  intercept(msg: OutgoingMessage, publish: PublishFn): void {
    const handler = this.handlers.get(msg.type)
    if (handler) {
      handler.handle(msg, publish)
    } else if (this.fallback) {
      this.fallback.handle(msg, publish)
    } else {
      // 无匹配也无兜底 → 直通
      publish(msg)
    }
  }

  /** 获取已注册的 type 列表 */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys())
  }
}
