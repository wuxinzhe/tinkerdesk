/**
 * agent-controller.ts — 本地 Agent controller 层（class 形式）
 *
 *  的职责 + 类方法化：
 * 每个 IPC 一个独立具名方法，register() 只做 ipcMain.handle 绑定。
 *   agent:chat           → sendChatMessage（对话前经 SessionContextFactory 构建 ctx）
 *   agent:toolResult     → submitToolResult
 *   agent:approval       → respondApproval
 *   agent:revoke         → revokeChatMessage
 *   agent:interrupt      → interruptSession
 *   agent:clearAll       → clearSessionState
 *
 * 流式 token 通过 agent:token 事件推送；最终响应以 MessageVO 返回（同源）。
 */

import { handleTrusted } from '../security/ipc-guard'
import { TinkerAgent } from '../core/loop/tinker-agent'
import type { TinkerAgentOptions } from '../core/loop/types'
import type { SessionContextFactory } from '../service/session-context-factory'
import type { SessionService } from '../service/session-service'
import type { MessageService } from '../service/message-service'
import { nowIso } from '../utils/time'
import type { ApiResponse } from './api-response'
import { fail, ok } from './api-response'
import { ElectronEventSender as EventSenderService } from '../service/event-sender-service'
import type { AgentApprovalRequestDTO, AgentClearAllRequestDTO, AgentInterruptRequestDTO, AgentMessageVO, AgentRevokeRequestDTO, AgentSendRequest, AgentToolResultRequestDTO } from './types'

/** Agent controller（OO 化：按 session 惰性实例化 TinkerAgent——一个会话一个实例） */
export class AgentController {
  /** 会话实例表：sessionId → TinkerAgent（惰性创建，clearAll 时 dispose + 移除） */
  private readonly agents = new Map<string, TinkerAgent>()

  constructor(
    private readonly agentLoopOptions: Omit<TinkerAgentOptions, 'sessionId' | 'profile'>,
    private readonly sessionContextFactory: SessionContextFactory,
    private readonly sessionService: SessionService,
    private readonly messageService: MessageService,
  ) { }

  /** 获取/惰性创建会话实例（profile 从 session 表查——IPC 不依赖前端传） */
  private getAgent(sessionId: string): TinkerAgent {
    let agent = this.agents.get(sessionId)
    if (agent) {
      return agent
    }
    const session = this.sessionService.findByIdAnyProfile(sessionId)
    const profile = session?.profile ?? 'default'
    agent = new TinkerAgent({ ...this.agentLoopOptions, sessionId, profile })
    this.agents.set(sessionId, agent)
    return agent
  }

  /** 注册全部 IPC handler（只做绑定，逻辑在独立具名方法） */
  register(): void {
    handleTrusted('agent:chat', (event, req) => this.sendChatMessage(event, req))
    handleTrusted('agent:toolResult', (_event, payload) => this.submitToolResult(_event, payload))
    handleTrusted('agent:approval', (_event, payload) => this.respondApproval(_event, payload))
    handleTrusted('agent:autoApprove', (_event, payload) => this.autoApprove(_event, payload))
    handleTrusted('agent:revoke', (_event, payload) => this.revokeChatMessage(_event, payload))
    handleTrusted('agent:interrupt', (_event, payload) => this.interruptSession(_event, payload))
    handleTrusted('agent:interruptNoPending', (_event, payload) => this.interruptNoPendingSession(_event, payload))
    handleTrusted('agent:clearAll', (_event, payload) => this.clearSessionState(_event, payload))
  }

  // ══════════════════════════════════════════════════════════════
  // 各 IPC 方法（具名方法 + 完整入参出参类型）
  // ══════════════════════════════════════════════════════════════

  /** 发送用户消息（onUserMessage）：构建 SessionContext（含 IEventSender）→ chat */
  private async sendChatMessage(event: Electron.IpcMainInvokeEvent, req: AgentSendRequest): Promise<ApiResponse<AgentMessageVO>> {
    const senderId = event.sender.id

    try {
      // 对话启动前构建 SessionContext（sender 封装全部事件通道；profile 必传指定 Agent）
      const ctx = this.sessionContextFactory.build({
        sessionId: req.sessionId,
        profile: req.profile,
        sender: new EventSenderService(senderId, req.sessionId ?? ''),
      })
      const result = await this.getAgent(req.sessionId ?? '').chat(ctx, req.content)

      // 返回统一的 MessageVO（同源）——走流式输出，全量回复已通过 agent:token 事件推送，
      // 此处不再返回 content（前端只取会话标识，避免双渲染/重复消息）
      return ok({
        id: undefined,
        sessionId: result.sessionId,
        conversationId: result.conversationId,
        role: 'assistant',
        content: '',
        reasoningContent: '',
        finishReason: result.response.finishReason,
        messageType: 'assistant_text',
        createdAt: nowIso(),
      })
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 提交工具执行结果（onToolResult）：UI/扩展工具异步返回 */
  private submitToolResult(_event: Electron.IpcMainInvokeEvent, payload: AgentToolResultRequestDTO): ApiResponse<null> {
    this.getAgent(payload.sessionId).onToolResult(payload.sessionId, payload.toolCallId, payload.result)
    // clarify 回答回显：把 user_response 写入对应 clarify_request 消息（刷新后卡片显示"已回复"）
    this.messageService.attachClarifyAnswer(payload.sessionId, payload.profile ?? 'default', payload.toolCallId, payload.result)
    return ok(null)
  }

  /** 响应审批请求（onApproval）：用户同意/拒绝 */
  private respondApproval(_event: Electron.IpcMainInvokeEvent, payload: AgentApprovalRequestDTO): ApiResponse<null> {
    this.getAgent(payload.sessionId).onApproval(payload.sessionId, payload.toolCallId, payload.approved)
    return ok(null)
  }

  /** 本轮对话自动批准（onAutoApprove）：当前挂起审批放行 + 本轮后续审批直接放行 */
  private autoApprove(_event: Electron.IpcMainInvokeEvent, payload: { conversationId: string }): ApiResponse<null> {
    if (!payload?.conversationId) {
      return fail('conversationId 不能为空')
    }
    for (const agent of this.agents.values()) {
      agent.setAutoApprove(payload.conversationId)
    }
    return ok(null)
  }

  /** 撤回消息（onRevoke） */
  private revokeChatMessage(_event: Electron.IpcMainInvokeEvent, payload: AgentRevokeRequestDTO): ApiResponse<null> {
    this.getAgent(payload.sessionId).revoke(payload.sessionId, payload.messageId)
    return ok(null)
  }

  /** 中断对话（onInterrupt / stop） */
  private interruptSession(_event: Electron.IpcMainInvokeEvent, payload: AgentInterruptRequestDTO): ApiResponse<null> {
    this.getAgent(payload.sessionId).interrupt(payload.sessionId)
    return ok(null)
  }

  /** 语音打断（纯 abort——不挂 pendingInterrupt——按住说话时先断当前回复） */
  private interruptNoPendingSession(_event: Electron.IpcMainInvokeEvent, payload: AgentInterruptRequestDTO): ApiResponse<null> {
    this.getAgent(payload.sessionId).interruptNoPending(payload.sessionId)
    return ok(null)
  }

  /** 清理会话状态（clearAll）：实例 dispose + 移除（OO 生命周期终结） */
  private clearSessionState(_event: Electron.IpcMainInvokeEvent, payload: AgentClearAllRequestDTO): ApiResponse<null> {
    const agent = this.agents.get(payload.sessionId)
    if (agent) {
      agent.dispose()
      this.agents.delete(payload.sessionId)
    }
    return ok(null)
  }
}
