/**
 * approval-manager.ts — 审批/工具结果管理（OO 化拆分 P3）
 *
 * 审批与工具结果挂起等待的状态与逻辑内聚于此：
 * - approvalWaiters / toolResultWaiters / autoApprove（表 + 方法同处一地——所有权一致）
 * - requestApproval（挂起 + 超时拒绝 + 事件）
 * - waitToolResult（挂起 + 超时结果）
 * - onApproval / onToolResult / setAutoApprove（外部 IPC 入口委托到这里）
 *
 * 生命周期 = 会话级（TinkerAgent 持有）；clearForSession/dispose 统一清理。
 */
import type { MessageService } from '../../service/message-service'
import { MessageFactory } from '../../service/message-service'
import type { ToolCall } from '../llm/types'
import {
  EVT_CHAT_INTERACTION_STATUS,
  MSG_TYPE_APPROVAL_REQUEST,
  MSG_TYPE_TOOL_RESULT,
  STATUS_TIMED_OUT
} from '../constants'
import type { ApprovalWaiterEntry, ConversationContext, ToolResultWaiterEntry } from './types'

export class ApprovalManager {
  /** 审批挂起表：toolCallId → waiter（超时自动拒绝） */
  private readonly approvalWaiters = new Map<string, ApprovalWaiterEntry>()
  /** 工具结果挂起表：toolCallId → waiter（超时返回超时结果） */
  private readonly toolResultWaiters = new Map<string, ToolResultWaiterEntry>()
  /** 本轮自动批准集合（conversationId → 有值则本轮所有审批直接放行） */
  private readonly autoApprove = new Set<string>()

  /** 审批超时（ms）：用户未响应视为拒绝 */
  private static readonly APPROVAL_TIMEOUT_MS = 60_000
  /** 澄清/工具结果超时（ms）：客户端未返回视为过期 */
  private static readonly CLARIFY_TIMEOUT_MS = 60_000

  constructor(private readonly messageService: MessageService) { }

  /** 本轮对话自动批准：当前挂起审批全部放行 + 后续本轮审批直接放行 */
  setAutoApprove(conversationId: string): void {
    this.autoApprove.add(conversationId)
    const pending = this.approvalWaiters.size
    for (const [toolCallId, waiter] of this.approvalWaiters) {
      this.approvalWaiters.delete(toolCallId)
      clearTimeout(waiter.timer)
      waiter.resolve(true)
      this.messageService.updateApprovalMessageStatusTemp(waiter.convId, toolCallId, true, waiter.profile, waiter.sessionId)
    }
    console.log(`[agent] 本轮自动批准已开启 conversationId=${conversationId}（放行挂起审批 ${pending} 个）`)
  }

  /** 周期结束清除本轮自动批准标记（下一次对话重新生效审批） */
  clearAutoApprove(conversationId: string): void {
    this.autoApprove.delete(conversationId)
  }

  /** 审批响应回调（onApprovalResponse）：用户同意/拒绝工具执行 */
  onApproval(sessionId: string, toolCallId: string, approved: boolean): boolean {
    const waiter = this.approvalWaiters.get(toolCallId)
    if (!waiter) {
      console.warn(`审批响应无挂起等待者：toolCallId=${toolCallId}`)
      return false
    }
    this.approvalWaiters.delete(toolCallId)
    clearTimeout(waiter.timer)
    waiter.resolve(approved)
    // 审批消息状态更新（暂存 + 落库）
    this.messageService.updateApprovalMessageStatusTemp(waiter.convId, toolCallId, approved, waiter.profile, sessionId)
    console.log(`action=APPROVAL sessionId=${sessionId} toolCallId=${toolCallId} approved=${approved}`)
    return true
  }

  /** 工具结果回调（onToolResult）：外部工具异步返回时挂起恢复 */
  onToolResult(sessionId: string, toolCallId: string, result: string): boolean {
    const waiter = this.toolResultWaiters.get(toolCallId)
    if (!waiter) {
      console.warn(`工具结果回调无挂起等待者：toolCallId=${toolCallId}`)
      return false
    }
    this.toolResultWaiters.delete(toolCallId)
    clearTimeout(waiter.timer)
    waiter.resolve(result)
    console.log(`action=TOOL_RESULT sessionId=${sessionId} toolCallId=${toolCallId} resultLen=${result.length}`)
    return true
  }

  /** 审批请求：注册挂起等待（60s 超时）→ sender 发审批事件 → 等 onApproval 恢复 */
  requestApproval(convCtx: ConversationContext, toolCall: ToolCall, reason?: string): Promise<boolean> {
    // 本轮自动批准：conversationId 在缓存中 → 直接放行（不弹审批、不挂起）
    if (this.autoApprove.has(convCtx.conversationId)) {
      console.log(`[agent] 审批自动放行（本轮 auto-approve）tool=${toolCall.name} toolCallId=${toolCall.id}`)
      return Promise.resolve(true)
    }
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.approvalWaiters.delete(toolCall.id)
        // 超时视为拒绝
        convCtx.sender.sendMessage(convCtx.sessionId, EVT_CHAT_INTERACTION_STATUS, {
          toolCallId: toolCall.id,
          interactionStatus: STATUS_TIMED_OUT,
          content: '⏰ 已过期',
          messageType: MSG_TYPE_APPROVAL_REQUEST,
        })
        // 暂存 + 落库标记过期
        this.markApprovalTimedOut(convCtx, toolCall.id)
        console.warn(`审批超时，视为拒绝 tool=${toolCall.name} toolCallId=${toolCall.id}`)
        resolve(false)
      }, ApprovalManager.APPROVAL_TIMEOUT_MS)
      this.approvalWaiters.set(toolCall.id, {
        resolve: (approved) => {
          clearTimeout(timer)
          resolve(approved)
        },
        timer,
        convId: convCtx.conversationId,
        profile: convCtx.profile,
        sessionId: convCtx.sessionId,
      })
      // 审批请求消息入暂存
      this.messageService.saveTempMessage(MessageFactory.buildApprovalRequest(
        convCtx.conversationId,
        convCtx.sessionId,
        convCtx.profile,
        toolCall.id,
        toolCall.name,
        reason,
        toolCall.arguments
      ))
      // 通过 sender 发审批事件
      convCtx.sender.sendApprovalRequest(convCtx.sessionId, {
        toolCallId: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments,
        reason,
        conversationId: convCtx.conversationId,
      })
    })
  }

  /** 等待外部工具结果（60s 超时，直到 onToolResult 恢复） */
  waitToolResult(cycle: ConversationContext, toolCallId: string): Promise<string> {
    return new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        this.toolResultWaiters.delete(toolCallId)
        cycle.sender.sendMessage(cycle.sessionId, EVT_CHAT_INTERACTION_STATUS, {
          toolCallId,
          interactionStatus: STATUS_TIMED_OUT,
          content: '⏰ 已过期',
          messageType: MSG_TYPE_TOOL_RESULT,
        })
        console.warn(`工具结果等待超时 toolCallId=${toolCallId}`)
        resolve('Error: 等待客户端工具结果超时（60s），工具调用已过期')
      }, ApprovalManager.CLARIFY_TIMEOUT_MS)
      this.toolResultWaiters.set(toolCallId, {
        resolve: (result) => {
          clearTimeout(timer)
          resolve(result)
        },
        timer,
      })
    })
  }

  /** 审批超时：暂存消息标记 timed_out + 落库 */
  private markApprovalTimedOut(convCtx: ConversationContext, toolCallId: string): void {
    // 暂存区查找更新
    const list = this.messageService.getTempMessages(convCtx.conversationId)
    for (const m of list) {
      if (m.role === 'approval' && m.toolCallId === toolCallId) {
        m.interactionStatus = STATUS_TIMED_OUT
        m.content = '⏰ 已过期'
      }
    }
    // 落库标记过期
    this.messageService.markApprovalExpired(toolCallId, convCtx.profile, convCtx.sessionId)
  }

  /** 清理指定会话的挂起项（clearAll 用——toolCallId 以 sessionId 前缀关联） */
  clearForSession(sessionId: string): void {
    for (const [toolCallId, waiter] of this.approvalWaiters) {
      if (toolCallId.startsWith(sessionId)) {
        clearTimeout(waiter.timer)
        waiter.resolve(false)
        this.approvalWaiters.delete(toolCallId)
      }
    }
    for (const [toolCallId, waiter] of this.toolResultWaiters) {
      if (toolCallId.startsWith(sessionId)) {
        clearTimeout(waiter.timer)
        waiter.resolve('')
        this.toolResultWaiters.delete(toolCallId)
      }
    }
  }

  /** 释放（幂等）：清全部挂起 + 自动批准 */
  dispose(): void {
    for (const [, waiter] of this.approvalWaiters) {
      clearTimeout(waiter.timer)
      waiter.resolve(false)
    }
    this.approvalWaiters.clear()
    for (const [, waiter] of this.toolResultWaiters) {
      clearTimeout(waiter.timer)
      waiter.resolve('')
    }
    this.toolResultWaiters.clear()
    this.autoApprove.clear()
  }
}
