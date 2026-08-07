/**
 * controller/electron-event-sender.ts — Electron WebContents 事件发送器
 *
 * 实现 IEventSender（对齐 Java StompEventHelper 职责）：
 * 通过 webContents 向渲染层推送事件，事件名映射本地 IPC 契约。
 * 由 AgentController 在 handleChat 时构建，注入 SessionContext。
 */
import { webContents } from 'electron'
import type { IEventSender } from '../core/loop/types'
import type { LlmChunk } from '../core/llm/types'
import type { StreamToken } from '../controller/types'

/** Electron WebContents 事件发送器 */
export class ElectronEventSender implements IEventSender {
  /** 待合并发送的 token 批（30ms 窗口，减少高频 IPC + 平滑渲染节奏） */
  private tokenBuffer: Array<{ sessionId: string; evt: StreamToken }> = []
  private tokenFlushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly senderId: number,
    private readonly sessionId: string
  ) {}

  /** 消息通道 */
  sendMessage(_sessionId: string, type: string, data: unknown): void {
    webContents.fromId(this.senderId)?.send('agent:message', { type, data })
  }

  /** 动作通道 */
  sendAction(sessionId: string, type: string, data: unknown): void {
    webContents.fromId(this.senderId)?.send('agent:action', { type, data, sessionId })
  }

  /** 提示信号通道 */
  sendTips(_sessionId: string, type: string, message: string): void {
    webContents.fromId(this.senderId)?.send('agent:queueTip', { type, message, sessionId: this.sessionId })
  }

  /** 流式 token 通道（LlmChunk → StreamToken 边界转换；30ms 窗口攒批合并发送） */
  sendToken(_sessionId: string, chunk: LlmChunk): void {
    // 调试日志门控：仅 LOG_DEBUG_TOKEN=1 时打印（排查流式字段问题用；默认关闭避免热路径 IO 拖慢流式）
    if (process.env.LOG_DEBUG_TOKEN === '1') {
      console.log('[TOKEN]', JSON.stringify({
        sessionId: _sessionId.slice(0, 8),
        text: chunk.text?.slice(0, 50) ?? '',
        reasoning: chunk.reasoning?.slice(0, 50) ?? '',
        toolCallArgs: chunk.toolCallArgs?.slice(0, 40) ?? '',
        toolCallName: chunk.toolCallName ?? '',
        isFinish: chunk.isFinish,
      }))
    }
    const evt: StreamToken = {
      text: chunk.text || undefined,
      reasoning: chunk.reasoning || undefined,
      toolCallArgs: chunk.toolCallArgs || undefined,
      toolCallName: chunk.toolCallName || undefined,
      isFinish: chunk.isFinish,
      finishReason: chunk.finishReason,
    }
    // 攒批：同一窗口内的多个 chunk 合并为一次 IPC（减少高频消息 + 渲染节奏更均匀）
    this.tokenBuffer.push({ sessionId: this.sessionId, evt })
    if (!this.tokenFlushTimer) {
      this.tokenFlushTimer = setTimeout(() => this.flushTokens(), 30)
    }
    // isFinish 立即 flush（最终 token 不延迟）
    if (chunk.isFinish) {
      this.flushTokens()
    }
  }

  /** 合并发送攒批的 token（按 session 聚合 text/reasoning/toolCallArgs） */
  private flushTokens(): void {
    if (this.tokenFlushTimer) {
      clearTimeout(this.tokenFlushTimer)
      this.tokenFlushTimer = null
    }
    if (this.tokenBuffer.length === 0) return

    const bySession = new Map<string, StreamToken>()
    for (const { sessionId, evt } of this.tokenBuffer) {
      const cur = bySession.get(sessionId) ?? {
        text: undefined, reasoning: undefined, toolCallArgs: undefined,
        isFinish: false, finishReason: undefined,
      } as StreamToken
      if (evt.text) cur.text = (cur.text ?? '') + evt.text
      if (evt.reasoning) cur.reasoning = (cur.reasoning ?? '') + evt.reasoning
      if (evt.toolCallArgs) cur.toolCallArgs = (cur.toolCallArgs ?? '') + evt.toolCallArgs
      if (evt.isFinish) {
        cur.isFinish = true
        cur.finishReason = evt.finishReason
      }
      bySession.set(sessionId, cur)
    }
    this.tokenBuffer = []
    for (const [sessionId, merged] of bySession) {
      webContents.fromId(this.senderId)?.send('agent:token', { ...merged, sessionId })
    }
  }

  /** 审批请求通道（对齐 Java APPROVAL_REQUEST：弹审批卡片） */
  sendApprovalRequest(sessionId: string, data: { toolCallId: string; name: string; arguments?: unknown; reason?: string; conversationId?: string }): void {
    console.log(`[agent] 审批请求 sessionId=${sessionId} tool=${data.name} toolCallId=${data.toolCallId} conv=${data.conversationId ?? '-'}`)
    webContents.fromId(this.senderId)?.send('agent:approvalRequest', { ...data, sessionId })
  }
}
