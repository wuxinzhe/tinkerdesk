/**
 * agent-controller.ts — 本地 Agent controller 层（class 形式）
 *
 * 对齐 tinker-agent StompController 的职责 + 类方法化：
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
import { ipcMain } from 'electron'
import type { AgentLoop } from '../core/loop/agent-loop'
import type { SessionContextFactory } from '../service/session-context-factory'
import { nowIso } from '../utils/time'
import type { ApiResponse } from './api-response'
import { fail, ok } from './api-response'
import { ElectronEventSender as EventSenderService } from '../service/event-sender-service'
import type { AgentApprovalRequestDTO, AgentClearAllRequestDTO, AgentInterruptRequestDTO, AgentMessageVO, AgentRevokeRequestDTO, AgentSendRequest, AgentToolResultRequestDTO } from './types'

/** Agent controller */
export class AgentController {
  constructor(
    private readonly agentLoop: AgentLoop,
    private readonly sessionContextFactory: SessionContextFactory
  ) { }

  /** 注册全部 IPC handler（只做绑定，逻辑在独立具名方法） */
  register(): void {
    ipcMain.handle('agent:chat', (event, req) => this.sendChatMessage(event, req))
    ipcMain.handle('agent:toolResult', (_event, payload) => this.submitToolResult(_event, payload))
    ipcMain.handle('agent:approval', (_event, payload) => this.respondApproval(_event, payload))
    ipcMain.handle('agent:revoke', (_event, payload) => this.revokeChatMessage(_event, payload))
    ipcMain.handle('agent:interrupt', (_event, payload) => this.interruptSession(_event, payload))
    ipcMain.handle('agent:clearAll', (_event, payload) => this.clearSessionState(_event, payload))
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
      const result = await this.agentLoop.chat(ctx, req.content)

      // 返回统一的 MessageVO（同源）
      return ok({
        id: undefined,
        sessionId: result.sessionId,
        conversationId: result.conversationId,
        role: 'assistant',
        content: result.response.text,
        reasoningContent: result.response.reasoningContent,
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
    this.agentLoop.onToolResult(payload.sessionId, payload.toolCallId, payload.result)
    return ok(null)
  }

  /** 响应审批请求（onApproval）：用户同意/拒绝 */
  private respondApproval(_event: Electron.IpcMainInvokeEvent, payload: AgentApprovalRequestDTO): ApiResponse<null> {
    this.agentLoop.onApproval(payload.sessionId, payload.toolCallId, payload.approved)
    return ok(null)
  }

  /** 撤回消息（onRevoke） */
  private revokeChatMessage(_event: Electron.IpcMainInvokeEvent, payload: AgentRevokeRequestDTO): ApiResponse<null> {
    this.agentLoop.revoke(payload.sessionId, payload.messageId)
    return ok(null)
  }

  /** 中断对话（onInterrupt / stop） */
  private interruptSession(_event: Electron.IpcMainInvokeEvent, payload: AgentInterruptRequestDTO): ApiResponse<null> {
    this.agentLoop.interrupt(payload.sessionId)
    return ok(null)
  }

  /** 清理会话状态（clearAll） */
  private clearSessionState(_event: Electron.IpcMainInvokeEvent, payload: AgentClearAllRequestDTO): ApiResponse<null> {
    this.agentLoop.clearAll(payload.sessionId)
    return ok(null)
  }
}
