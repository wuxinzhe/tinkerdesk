/**
 * message-controller.ts — 消息 IPC controller（class 形式）
 *
 * 复刻 tinker-agent MessageController（本地单用户版，去 userId）：
 * 会话消息 / 对话消息 / 删除对话消息。
 * 分层：controller → service（MessageService），不直接访问 repository。
 * IPC 前缀：message:*
 *
 * 结构：register() 只做 ipcMain.handle 绑定，逻辑在独立具名方法（入参出参完整类型）。
 */
import { ipcMain } from 'electron'
import type { MessageService } from '../service/message-service'
import type { ApiResponse } from './api-response'
import { ok, fail } from './api-response'
import type { SessionMessagesQueryDTO, ConversationMessagesQueryDTO, DeleteConversationRequestDTO } from './types'

/** 消息 controller */
export class MessageController {
  constructor(private readonly messageService: MessageService) { }

  /** 注册全部 IPC handler（只做绑定，逻辑在独立具名方法） */
  register(): void {
    ipcMain.handle('message:bySession', (_event, payload) => this.listSessionMessages(payload))
    ipcMain.handle('message:byConversation', (_event, payload) => this.listConversationMessages(payload))
    ipcMain.handle('message:deleteConversation', (_event, payload) => this.deleteConversationMessages(payload))
  }

  // ══════════════════════════════════════════════════════════════
  // 各 IPC 方法（具名方法 + 完整入参出参类型）
  // ══════════════════════════════════════════════════════════════

  /** 查询会话消息（分页，按 profile 限定） */
  private listSessionMessages(payload: SessionMessagesQueryDTO): ApiResponse<unknown> {
    const sessionId = payload?.sessionId
    if (!sessionId) {
      return fail('sessionId 不能为空')
    }
    const profile = payload?.profile ?? 'default'
    const limit = payload?.limit ?? 50
    const offset = payload?.offset ?? 0
    const messages = this.messageService.listMessagesBySession(sessionId, profile, limit, offset)
    return ok(messages)
  }

  /** 查询对话消息（全部，按 profile 限定） */
  private listConversationMessages(payload: ConversationMessagesQueryDTO): ApiResponse<unknown> {
    const conversationId = payload?.conversationId
    if (!conversationId) {
      return fail('conversationId 不能为空')
    }
    const profile = payload?.profile ?? 'default'
    const messages = this.messageService.listMessagesByConversation(conversationId, profile)
    return ok(messages)
  }

  /** 删除对话消息（按 profile 限定） */
  private deleteConversationMessages(payload: DeleteConversationRequestDTO): ApiResponse<null> {
    const conversationId = payload?.conversationId
    if (!conversationId) {
      return fail('conversationId 不能为空')
    }
    const deleted = this.messageService.deleteConversationMessages(conversationId, payload?.profile ?? 'default')
    return deleted ? ok(null) : fail('对话不存在')
  }
}
