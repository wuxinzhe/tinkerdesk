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

  /** 流式 token 通道（LlmChunk → StreamToken 边界转换） */
  sendToken(_sessionId: string, chunk: LlmChunk): void {
    const evt: StreamToken = {
      text: chunk.text || undefined,
      reasoning: chunk.reasoning || undefined,
      toolCallArgs: chunk.toolCallArgs || undefined,
      isFinish: chunk.isFinish,
      finishReason: chunk.finishReason,
    }
    webContents.fromId(this.senderId)?.send('agent:token', evt)
  }

  /** 审批请求通道（对齐 Java APPROVAL_REQUEST：弹审批卡片） */
  sendApprovalRequest(sessionId: string, data: { toolCallId: string; name: string; arguments?: unknown; reason?: string; conversationId?: string }): void {
    console.log(`[agent] 审批请求 sessionId=${sessionId} tool=${data.name} toolCallId=${data.toolCallId} conv=${data.conversationId ?? '-'}`)
    webContents.fromId(this.senderId)?.send('agent:approvalRequest', { ...data, sessionId })
  }
}
