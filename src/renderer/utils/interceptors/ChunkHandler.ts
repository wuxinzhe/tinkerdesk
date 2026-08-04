/**
 * ChunkHandler.ts — 分片处理器
 *
 * 适用于 user_message、tool_result 等可能携带大负载的通道。
 * 策略：
 *   ≤ maxDirect        → 直传
 *   maxDirect ~ maxAllowed → 分片
 *   > maxAllowed       → 拒绝 + Error 弹窗
 *
 * user_message：按标点切分 content 文本，每段独立作为 user_message 发送
 *               前 N-1 段尾部追加「（接下条）」标记
 * tool_result： 按长度切分 result 文本，通过 chunk 协议发送到服务端重组
 */
import type { MessageHandler, OutgoingMessage } from './InterceptionPipeline'
import { showErrorToast } from '@/renderer/utils/notification-utils'

export interface ChunkHandlerOptions {
  /** 直传上限（bytes），超过此值开始分片 */
  maxDirect: number
  /** 允许最大值（bytes），超过此值拒绝 */
  maxAllowed: number
  /** 每个分片的目标大小（bytes），默认 maxDirect */
  chunkSize?: number
}

export class ChunkHandler implements MessageHandler {
  private maxDirect: number
  private maxAllowed: number
  private chunkSize: number

  constructor(options: ChunkHandlerOptions) {
    this.maxDirect = options.maxDirect
    this.maxAllowed = options.maxAllowed
    this.chunkSize = options.chunkSize ?? options.maxDirect
  }

  handle(msg: OutgoingMessage, next: (m: Record<string, unknown>) => void): void {
    const byteSize = this.getMessageByteSize(msg)

    if (byteSize <= this.maxDirect) {
      next(msg)
      return
    }

    if (byteSize > this.maxAllowed) {
      showErrorToast({
        code: 'MSG_TOO_LARGE',
        message: `消息过大（${formatSize(byteSize)}），超过 ${formatSize(this.maxAllowed)} 限制。`
          + `请自行筛选或切分后分批发送。`
      })
      return
    }

    // 分片
    if (msg.type === 'user_message') {
      this.splitUserMessage(msg, next)
    } else {
      this.splitGeneric(msg, next)
    }
  }

  /**
   * user_message 分片：按标点切 content 文本，每段作为独立 user_message 发送。
   * 尾部追加「（接下条）」标记（最后一段不加）。
   */
  private splitUserMessage(msg: OutgoingMessage, next: (m: Record<string, unknown>) => void): void {
    const content = String(msg.content ?? '')
    // chunkSize 是 byte 单位的阈值，转换为字符数（按最坏情况 3 bytes/char 估算）
    const maxChars = Math.floor(this.chunkSize / 3)
    const segments = splitByPunctuation(content, maxChars)
    const total = segments.length

    for (let i = 0; i < total; i++) {
      let text = segments[i]
      if (i < total - 1) {
        text += '（接下条）'
      }
      next({ ...msg, content: text })
    }
  }

  /**
   * tool_result 等通用分片：按长度切 payload，通过 chunk 协议发送到服务端重组。
   */
  private splitGeneric(msg: OutgoingMessage, next: (m: Record<string, unknown>) => void): void {
    const body = JSON.stringify(msg)
    const chunkId = generateChunkId()
    const totalChunks = Math.ceil(body.length / this.chunkSize)

    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.chunkSize
      const end = Math.min(start + this.chunkSize, body.length)

      const chunkMsg: OutgoingMessage = {
        type: 'chunk',
        originalType: msg.type,
        chunkId,
        chunkIndex: i,
        totalChunks,
        payload: body.slice(start, end)
      }
      next(chunkMsg)
    }
  }

  /** 获取消息体的近似字节大小（用 UTF-8 编码长度） */
  private getMessageByteSize(msg: OutgoingMessage): number {
    // 对于 user_message，只估算 content 字段的大小
    if (msg.type === 'user_message') {
      const content = String(msg.content ?? '')
      return content.length * 3  // 中英文混排，按 3 倍 char 估算
    }
    // 其余类型 JSON 序列化后估算
    return JSON.stringify(msg).length
  }
}

// ── 辅助函数 ──

/**
 * 按标点符号切分文本，每段不超过 maxChars 个字符。
 *
 * 切分优先级：
 * 1. 在 。！？!? 处切（优先）
 * 2. 在 ，、；,; 处切（次优）
 * 3. 在换行/空格处切（兜底）
 * 4. 以上都没有才硬切
 */
function splitByPunctuation(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]

  const segments: string[] = []
  let start = 0

  while (start < text.length) {
    const end = findSplitPoint(text, start, maxChars)
    segments.push(text.slice(start, end))
    start = end
  }

  return segments
}

/**
 * 在 [start, start + maxChars) 范围内寻找最佳切分点。
 * 返回切分结束位置（slice end），即从 start 开始切出的这段的终点。
 */
function findSplitPoint(text: string, start: number, maxChars: number): number {
  const end = start + maxChars
  if (end >= text.length) return text.length

  const segment = text.slice(start, end)

  // 优先级 1：标点句末
  const puncMatch = segment.match(/[。！？!?][^。！？!?]*$/)
  if (puncMatch && puncMatch.index && puncMatch.index > 0) {
    return start + puncMatch.index + 1
  }

  // 优先级 2：次要标点
  const subMatch = segment.match(/[，、；,;][^，、；,;]*$/)
  if (subMatch && subMatch.index && subMatch.index > 0) {
    return start + subMatch.index + 1
  }

  // 优先级 3：换行符
  const nlIndex = segment.lastIndexOf('\n')
  if (nlIndex > Math.floor(maxChars * 0.3)) {
    return start + nlIndex + 1
  }

  // 优先级 4：空格
  const spIndex = segment.lastIndexOf(' ')
  if (spIndex > Math.floor(maxChars * 0.3)) {
    return start + spIndex + 1
  }

  // 兜底：硬切
  return end
}

function generateChunkId(): string {
  return `chunk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}
