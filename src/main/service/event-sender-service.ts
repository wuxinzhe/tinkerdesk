/**
 * service/electron-event-sender.ts — Electron WebContents 事件发送器
 *
 * Implements IEventSender (protocol in docs/event-protocol.md):
 * all main → renderer events go through the single IPC_MESSAGE channel
 * ('agent:message'), message shape { route, sessionId, data } —
 * route = '{level1}:{level2-type}' single-field two levels.
 *
 * 一级路由 = 业务域（chat/session/action/tip/error）；客户端 split(':') 解析。
 * 未来接云 Agent：实现同一 IEventSender 接口（WebSocket 传输），route 语义不变。
 */
import { webContents } from 'electron'
import { eventRecorder } from './event-recorder'
import type { IEventSender } from '../core/loop/types'
import type { LlmChunk } from '../core/llm/types'
import type { StreamToken } from '../controller/types'
import {
  EVT_CHAT_APPROVAL, EVT_CHAT_TOKEN,
  ROUTE_ACTION, ROUTE_CHAT, ROUTE_ERROR, ROUTE_SESSION, ROUTE_TIP,
  IPC_MESSAGE,
} from '../core/constants'

/** Electron WebContents 事件发送器 */
export class ElectronEventSender implements IEventSender {
  /** 待合并发送的 token 批（30ms 窗口，减少高频 IPC + 平滑渲染节奏） */
  private tokenBuffer: Array<{ sessionId: string; evt: StreamToken }> = []
  private tokenFlushTimer: ReturnType<typeof setTimeout> | null = null
  /** 攒批尺寸上限：超过立即 flush（即使时间窗未到——防止单批过大、内存/传输膨胀） */
  private static readonly MAX_TOKEN_BUFFER = 50

  constructor(
    private readonly senderId: number,
    private readonly sessionId: string
  ) {}

  /** 统一出口：route 单字段两级 + data（convId 可选——事件携带对话标识） */
  private send(sessionId: string, route: string, data: unknown, convId?: string): void {
    webContents.fromId(this.senderId)?.send(IPC_MESSAGE, { route, sessionId, convId, data })
  }

  /** chat 域（对话内容流） */
  sendMessage(sessionId: string, type: string, data: unknown): void {
    this.send(sessionId, `${ROUTE_CHAT}:${type}`, data)
  }

  /** action 域（行为动作） */
  sendAction(sessionId: string, type: string, data: unknown): void {
    this.send(sessionId, `${ROUTE_ACTION}:${type}`, data)
  }

  /** session 域（会话数据/状态）——convId 可选（多会话并发时区分对话） */
  sendSession(sessionId: string, type: string, data: unknown, convId?: string): void {
    this.send(sessionId, `${ROUTE_SESSION}:${type}`, data, convId)
  }

  /** tip 域（提示信号） */
  sendTips(sessionId: string, type: string, message: string): void {
    this.send(sessionId, `${ROUTE_TIP}:${type}`, message)
  }

  /** error 域（报错） */
  sendError(sessionId: string, type: string, message: string): void {
    this.send(sessionId, `${ROUTE_ERROR}:${type}`, message)
  }

  /** 流式 token（chat:token——LlmChunk → StreamToken 边界转换；30ms 窗口攒批合并发送） */
  sendToken(sessionId: string, chunk: LlmChunk): void {
    // 调试日志门控：仅 LOG_DEBUG_TOKEN=1 时打印（排查流式字段问题用；默认关闭避免热路径 IO 拖慢流式）
    if (process.env.LOG_DEBUG_TOKEN === '1') {
      console.log('[TOKEN]', JSON.stringify({
        sessionId: sessionId.slice(0, 8),
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
    this.tokenBuffer.push({ sessionId, evt })
    // 尺寸超限 → 立即 flush（时间窗重置由 flushTokens 内 clearTimeout 完成）
    if (this.tokenBuffer.length >= ElectronEventSender.MAX_TOKEN_BUFFER) {
      this.flushTokens()
      return
    }
    if (!this.tokenFlushTimer) {
      this.tokenFlushTimer = setTimeout(() => this.flushTokens(), 30)
    }
    // isFinish 立即 flush（最终 token 不延迟）
    if (chunk.isFinish) {
      this.flushTokens()
    }
  }

  /** 合并发送攒批的 token（按 session 分组——原样 chunk 数组，不拼接；前端负责累积拼接）——chat:token */
  private flushTokens(): void {
    if (this.tokenFlushTimer) {
      clearTimeout(this.tokenFlushTimer)
      this.tokenFlushTimer = null
    }
    if (this.tokenBuffer.length === 0) return

    const bySession = new Map<string, StreamToken[]>()
    for (const { sessionId, evt } of this.tokenBuffer) {
      const list = bySession.get(sessionId) ?? []
      list.push(evt)
      bySession.set(sessionId, list)
    }
    this.tokenBuffer = []
    for (const [sessionId, chunks] of bySession) {
      // 事件埋点：逐 chunk 记录（assistant/chunk——一个 chunk 一条——
      // 完整留底——执行过程透明可追溯；膨胀靠环形总量控制——maxRows 超了挤最早）
      for (const c of chunks) {
        eventRecorder.record({
          sessionId,
          eventType: 'stream',
          eventName: 'chunk',
          payload: {
            text: c.text ?? '',
            reasoning: c.reasoning ?? '',
            toolCallArgs: c.toolCallArgs ?? '',
            toolCallName: c.toolCallName ?? '',
            toolCallIndex: c.toolCallIndex ?? undefined,
            isFinish: c.isFinish ?? false,
            finishReason: c.finishReason ?? '',
          },
        })
      }
      this.send(sessionId, `${ROUTE_CHAT}:${EVT_CHAT_TOKEN}`, { chunks })
    }
  }

  /** 审批请求 */
  sendApprovalRequest(sessionId: string, data: { toolCallId: string; name: string; arguments?: unknown; reason?: string; conversationId?: string }): void {
    console.log(`[agent] 审批请求 sessionId=${sessionId} tool=${data.name} toolCallId=${data.toolCallId} conv=${data.conversationId ?? '-'}`)
    this.send(sessionId, `${ROUTE_CHAT}:${EVT_CHAT_APPROVAL}`, data)
  }
}
