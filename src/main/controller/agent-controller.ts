/**
 * agent-controller.ts — Local agent IPC controller (class form)
 *
 * 职责 + class-method 映射（register() 只绑定 ipcMain.handle）：
 *   agent:chat           → sendChatMessage（默认对话路径：host.dispatch → AgentWorker 进程跑一整个 AgentLoop）
 *   agent:toolResult     → submitToolResult
 *   agent:approval       → respondApproval
 *   agent:autoApprove    → autoApprove
 *   agent:revoke         → revokeChatMessage
 *   agent:interrupt      → interruptSession
 *   agent:interruptNoPending → interruptNoPendingSession
 *   agent:clearAll       → clearSessionState
 *
 * ── 块3：默认对话切换到 AgentWorker 进程 ──
 *   主进程不再内联驱动 TinkerAgent。所有会话操作（chat 及中断/审批/工具结果/清空等）都经
 *   AgentWorkerHost 转发到对应会话的 worker 进程，由 worker 内的一整个 AgentLoop
 *   （TinkerAgent + waitToolResult / ApprovalManager / SessionRuntime）处理。
 *   流式 token 由 worker 侧 IEventSender 经 host 转发回 UI（ElectronEventSender —— route
 *   形态与前内联路径完全一致），前端契约不变。
 *
 *   前端契约（硬约束，保持不变）：
 *   - agent:chat 返回 MessageVO（前端只取 sessionId/convId/finishReason 等，不取 content）；
 *     且 chat Promise 在 Agent 完成（agent:done/error）后才 resolve——保持原内联时序。
 *   - 流式 token 仍以渲染层已订阅的形态推送：IPC_MESSAGE 单通道 route='chat:token'，
 *     data={ chunks: StreamToken[] }。
 */

import { handleTrusted } from '../security/ipc-guard'
import type { SessionService } from '../service/session-service'
import type { MessageService } from '../service/message-service'
import type { AgentWorkerHost } from '../core/agent/agent-worker-host'
import { nowIso } from '../utils/time'
import type { ApiResponse } from './api-response'
import { fail, ok } from './api-response'
import type {
  AgentApprovalRequestDTO,
  AgentClearAllRequestDTO,
  AgentInterruptRequestDTO,
  AgentMessageVO,
  AgentRevokeRequestDTO,
  AgentSendRequest,
  AgentToolResultRequestDTO,
} from './types'

/** Agent controller（块3：默认对话走 AgentWorker 进程——宿主只做转发，不持有内联 TinkerAgent） */
export class AgentController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly messageService: MessageService,
    private readonly agentWorkerHost?: AgentWorkerHost,
  ) { }

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

  /**
   * 默认对话路径（agent:chat）：user 文本 → host → AgentWorker 进程内一整个 AgentLoop。
   * 会话存在则用、不存在则主进程先建（worker 的 SessionContextFactory.build 要求会话已在 DB）；
   * 登记前端回流 target（setRelay）后 dispatch agent:prompt；再 awaitDone 同步等待 worker
   * 回 agent:done/error，才返回 MessageVO——保持原内联路径"chat() 在 Agent 完成后才 resolve"的
   * 前端时序契约（流式 token 由 worker 侧经 host 以 chat:token 通道提前推送）。
   */
  private async sendChatMessage(event: Electron.IpcMainInvokeEvent, req: AgentSendRequest): Promise<ApiResponse<AgentMessageVO>> {
    const senderId = event.sender.id
    if (!this.agentWorkerHost) {
      return fail('AgentWorkerHost 未初始化（agentWorkerHost 未注入）')
    }
    try {
      const profile = req.profile || 'default'
      // 会话：存在则用；不存在则主进程先建（worker 的 SessionContextFactory.build 要求会话已在 DB）
      let sessionId = req.sessionId
      if (!sessionId) {
        const created = this.sessionService.create(profile)
        sessionId = created.id
      }
      // 登记该会话 worker 事件回流目标（当前 renderer）
      this.agentWorkerHost.setRelay(sessionId, senderId)
      // 先登记完成等待（worker 回 agent:done/error 时 resolve）→ 再 dispatch 驱动 AgentLoop
      const done = this.agentWorkerHost.awaitDone(sessionId)
      this.agentWorkerHost.dispatch(sessionId, { type: 'agent:prompt', sessionId, profile, text: req.content })
      const { conversationId, finishReason, error } = await done
      if (error) {
        return fail(error)
      }
      // 返回统一的 MessageVO（同源）——走流式输出，全量回复已通过 chat:token 事件推送，
      // 此处不再返回 content（前端只取会话标识，避免双渲染/重复消息）
      return ok({
        id: undefined,
        sessionId,
        conversationId: conversationId ?? '',
        role: 'assistant',
        content: '',
        reasoningContent: '',
        finishReason: finishReason ?? 'stop',
        messageType: 'assistant_text',
        createdAt: nowIso(),
      })
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 工具结果回调（onToolResult）：转发到 worker 内 AgentLoop 的 waitToolResult 恢复挂起 */
  private submitToolResult(_event: Electron.IpcMainInvokeEvent, payload: AgentToolResultRequestDTO): ApiResponse<null> {
    if (this.agentWorkerHost) {
      this.agentWorkerHost.dispatch(payload.sessionId, {
        type: 'agent:toolResult',
        sessionId: payload.sessionId,
        toolCallId: payload.toolCallId,
        result: payload.result,
      })
    }
    // clarify 回答回显：把 user_response 写入对应 clarify_request 消息（宿主侧 DB 职责——始终保留）
    this.messageService.attachClarifyAnswer(payload.sessionId, payload.profile ?? 'default', payload.toolCallId, payload.result)
    return ok(null)
  }

  /** 响应审批请求（onApproval）：转发到 worker 内 AgentLoop 的 ApprovalManager 恢复挂起 */
  private respondApproval(_event: Electron.IpcMainInvokeEvent, payload: AgentApprovalRequestDTO): ApiResponse<null> {
    if (this.agentWorkerHost) {
      this.agentWorkerHost.dispatch(payload.sessionId, {
        type: 'agent:approval',
        sessionId: payload.sessionId,
        toolCallId: payload.toolCallId,
        approved: payload.approved,
      })
    }
    return ok(null)
  }

  /** 本轮对话自动批准（onAutoApprove）：广播到所有 worker——各自放行对应 conversationId 的审批 */
  private autoApprove(_event: Electron.IpcMainInvokeEvent, payload: { conversationId: string }): ApiResponse<null> {
    if (!payload?.conversationId) {
      return fail('conversationId 不能为空')
    }
    if (this.agentWorkerHost) {
      this.agentWorkerHost.broadcast({ type: 'agent:autoApprove', conversationId: payload.conversationId })
    }
    return ok(null)
  }

  /** 撤回消息（onRevoke）：转发到 worker 内 AgentLoop 的 SessionRuntime 队列 */
  private revokeChatMessage(_event: Electron.IpcMainInvokeEvent, payload: AgentRevokeRequestDTO): ApiResponse<null> {
    if (this.agentWorkerHost) {
      this.agentWorkerHost.dispatch(payload.sessionId, {
        type: 'agent:revoke',
        sessionId: payload.sessionId,
        messageId: payload.messageId,
      })
    }
    return ok(null)
  }

  /** 中断对话（onInterrupt / stop）：转发到 worker 内 AgentLoop 的 SessionRuntime */
  private interruptSession(_event: Electron.IpcMainInvokeEvent, payload: AgentInterruptRequestDTO): ApiResponse<null> {
    if (this.agentWorkerHost) {
      this.agentWorkerHost.dispatch(payload.sessionId, { type: 'agent:interrupt', sessionId: payload.sessionId })
    }
    return ok(null)
  }

  /** 语音打断（纯 abort——不挂 pendingInterrupt）：转发到 worker 内 AgentLoop 的 SessionRuntime */
  private interruptNoPendingSession(_event: Electron.IpcMainInvokeEvent, payload: AgentInterruptRequestDTO): ApiResponse<null> {
    if (this.agentWorkerHost) {
      this.agentWorkerHost.dispatch(payload.sessionId, { type: 'agent:interruptNoPending', sessionId: payload.sessionId })
    }
    return ok(null)
  }

  /** 清理会话状态（clearAll）：转发到 worker 内 AgentLoop（clearAll + dispose），实例从 worker 侧移除；随后显式释放该会话 worker 进程（池回收——clearAll 仅清内存态，立即 kill 无 DB 丢失） */
  private clearSessionState(_event: Electron.IpcMainInvokeEvent, payload: AgentClearAllRequestDTO): ApiResponse<null> {
    if (this.agentWorkerHost) {
      this.agentWorkerHost.dispatch(payload.sessionId, { type: 'agent:clearAll', sessionId: payload.sessionId })
      this.agentWorkerHost.disposeSession(payload.sessionId)
    }
    return ok(null)
  }
}
