/**
 * message-service.ts — 消息服务层
 *
 * 复刻 tinker-agent IMessageService（本地单用户版）：
 * - 两层存储：进行中消息暂存（内存）+ 完成后落库（SQLite）
 * - loadContextMessages：合并历史 + 当前暂存，供 LLM 上下文构建
 * - 审批状态更新、对话删除、摘要保存
 */
import { MessageRepository } from '../repository/message-repository'
import type { MessageEntity } from '../repository/types'
import { ConversationRepository } from '../repository/conversation-repository'
import type { ApiMessage } from '../core/llm/types'
import { ROLE_SYSTEM } from '../core/loop/constants'
import { STATUS_APPROVED, STATUS_REJECTED } from '../core/loop/constants'
import {
  MSG_TYPE_USER, MSG_TYPE_USER_CONTINUE, MSG_TYPE_ASSISTANT_TEXT, MSG_TYPE_ASSISTANT_TOOL_CALL,
  MSG_TYPE_ASSISTANT_HYBRID, MSG_TYPE_ASSISTANT_THINKING, MSG_TYPE_TOOL_RESULT,
  MSG_TYPE_APPROVAL_REQUEST, MSG_TYPE_CLARIFY_REQUEST, MSG_TYPE_SYSTEM_SUMMARY,
  MSG_TYPE_DISPLAY_SET, MSG_TYPE_LLM_CONTEXT_SET,
  STATUS_PENDING,
  FINISH_COMPLETE, FINISH_LENGTH,
} from '../core/constants/message'

/** 消息类型 / 完成原因常量（定义在 core/constants/message，此处 re-export 保持既有导入链） */
export {
  MSG_TYPE_USER, MSG_TYPE_USER_CONTINUE, MSG_TYPE_ASSISTANT_TEXT, MSG_TYPE_ASSISTANT_TOOL_CALL,
  MSG_TYPE_ASSISTANT_HYBRID, MSG_TYPE_ASSISTANT_THINKING, MSG_TYPE_TOOL_RESULT,
  MSG_TYPE_APPROVAL_REQUEST, MSG_TYPE_CLARIFY_REQUEST, MSG_TYPE_SYSTEM_SUMMARY,
  FINISH_COMPLETE, FINISH_LENGTH,
} from '../core/constants/message'

/** 消息实体构建器（对应 MessageEntity.buildXxx 静态工厂） */
export class MessageFactory {
  static buildUserMessage(convId: string, sessionId: string, profile: string, content: string): MessageEntity {
    return {
      sessionId,
      conversationId: convId,
      profile,
      role: 'user',
      content,
      reasoningContent: '',
      toolCall: null,
      toolCallId: '',
      toolName: '',
      finishReason: FINISH_COMPLETE,
      interactionStatus: '',
      messageType: MSG_TYPE_USER,
      deleted: false,
    }
  }

  static buildAssistantText(convId: string, sessionId: string, profile: string, content: string): MessageEntity {
    return {
      sessionId,
      conversationId: convId,
      profile,
      role: 'assistant',
      content,
      reasoningContent: '',
      toolCall: null,
      toolCallId: '',
      toolName: '',
      finishReason: FINISH_COMPLETE,
      interactionStatus: '',
      messageType: MSG_TYPE_ASSISTANT_TEXT,
      deleted: false,
    }
  }

  static buildAssistantToolCall(
    convId: string,
    sessionId: string,
    profile: string,
    reasoningContent: string,
    toolCalls: Record<string, { name: string; arguments: unknown }>
  ): MessageEntity {
    return {
      sessionId,
      conversationId: convId,
      profile,
      role: 'assistant',
      content: '',
      reasoningContent: reasoningContent ?? '',
      toolCall: JSON.stringify(toolCalls),
      toolCallId: '',
      toolName: '',
      finishReason: FINISH_COMPLETE,
      interactionStatus: '',
      messageType: MSG_TYPE_ASSISTANT_TOOL_CALL,
      deleted: false,
    }
  }

  static buildAssistantThinking(convId: string, sessionId: string, profile: string, reasoning: string): MessageEntity {
    return {
      sessionId,
      conversationId: convId,
      profile,
      role: 'assistant',
      content: '',
      reasoningContent: reasoning ?? '',
      toolCall: null,
      toolCallId: '',
      toolName: '',
      finishReason: FINISH_COMPLETE,
      interactionStatus: '',
      messageType: MSG_TYPE_ASSISTANT_THINKING,
      deleted: false,
    }
  }

  /** 审批请求消息（对齐 Java MessageEntity.buildApprovalRequest：toolCall 存 {toolCallId:{name,arguments}} JSON） */
  static buildApprovalRequest(
    convId: string,
    sessionId: string,
    profile: string,
    toolCallId: string,
    toolName: string,
    reason: string | undefined,
    argumentsData: unknown
  ): MessageEntity {
    return {
      sessionId,
      conversationId: convId,
      profile,
      role: 'approval',
      toolCallId,
      toolName,
      messageType: MSG_TYPE_APPROVAL_REQUEST,
      interactionStatus: STATUS_PENDING,
      content: reason != null ? `⏳ 需要审批：${reason}` : '⏳ 等待审批',
      toolCall: argumentsData != null
        ? JSON.stringify({ [toolCallId]: { name: toolName, arguments: argumentsData } })
        : null,
      reasoningContent: '',
      finishReason: FINISH_COMPLETE,
      deleted: false,
    }
  }

  static buildToolResult(convId: string, sessionId: string, profile: string, toolCallId: string, content: string): MessageEntity {
    return {
      sessionId,
      conversationId: convId,
      profile,
      role: 'tool',
      content,
      reasoningContent: '',
      toolCall: null,
      toolCallId,
      toolName: '',
      finishReason: FINISH_COMPLETE,
      interactionStatus: '',
      messageType: MSG_TYPE_TOOL_RESULT,
      deleted: false,
    }
  }
}

/** 消息服务 */
export class MessageService {
  /** 进行中对话的暂存消息（内存 Map，替代 Redis conv:msgs:{convId}） */
  private readonly tempMessages = new Map<string, MessageEntity[]>()

  constructor(
    private readonly messageRepo: MessageRepository,
    private readonly conversationRepo: ConversationRepository
  ) { }

  /** 保存消息到暂存（对话进行中） */
  saveTempMessage(entity: MessageEntity): void {
    const convId = entity.conversationId ?? ''
    const list = this.tempMessages.get(convId) ?? []
    list.push(entity)
    this.tempMessages.set(convId, list)
  }

  /** 读取指定对话的暂存消息（供审批超时标记等场景直接修改） */
  getTempMessages(convId: string): MessageEntity[] {
    return this.tempMessages.get(convId) ?? []
  }

  /** 更新审批状态（approved/rejected） */
  updateApprovalMessageStatusTemp(convId: string, toolCallId: string, approved: boolean, profile: string, sessionId: string): void {
    // 暂存区查找匹配消息更新
    const list = this.tempMessages.get(convId) ?? []
    for (const m of list) {
      if (m.role === 'approval' && m.toolCallId === toolCallId) {
        m.interactionStatus = approved ? STATUS_APPROVED : STATUS_REJECTED
        m.content = approved ? '用户批准执行' : '用户拒绝执行'
      }
    }
    // 落库更新
    this.messageRepo.updateApprovalStatus(toolCallId, approved ? 'approved' : 'rejected', approved ? '用户批准执行' : '用户拒绝执行', profile, sessionId)
  }

  /** 标记审批卡片为已过期 */
  markApprovalExpired(toolCallId: string, profile: string, sessionId: string): void {
    this.messageRepo.updateApprovalStatusTimedOut(toolCallId, profile, sessionId)
  }

  /** 按 session 分页查询消息（DB 已落库 + 拼上当前进行中对话的暂存消息；按 DISPLAY_SET 控制可见性） */
  listMessagesBySession(sessionId: string, profile: string, limit: number, offset: number): MessageEntity[] {
    const db = this.messageRepo.findMessagesBySession({
      sessionId,
      profile,
      sortOrder: 'ASC',
      limit,
    })
    // 拼上暂存消息（进行中对话尚未落库：流式中的 assistant/工具结果/审批卡片）
    // 场景：切 session 再回来 / 刷新页面时，进行中的对话消息不丢失
    const temp: MessageEntity[] = []
    for (const msgs of this.tempMessages.values()) {
      for (const m of msgs) {
        if (m.sessionId === sessionId && m.profile === profile && !m.deleted) {
          temp.push(m)
        }
      }
    }
    // 可见性：只返回 DISPLAY_SET 内的消息类型（对齐 Java TYPE_DISPLAY_TYPES）
    const visible = (m: MessageEntity) => m.messageType != null && MSG_TYPE_DISPLAY_SET.has(m.messageType)
    const dbVisible = db.filter(visible)
    const tempVisible = temp.filter(visible)
    if (tempVisible.length === 0) return dbVisible.slice(offset)
    const all = [...dbVisible, ...tempVisible].sort((a, b) =>
      (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || (a.id ?? 0) - (b.id ?? 0)
    )
    return all.slice(offset)
  }

  /** 按 conversation 查询全部消息 */
  listMessagesByConversation(conversationId: string, profile: string): MessageEntity[] {
    return this.messageRepo.findByConditions({ conversationId, profile })
  }

  /** 合并历史 + 当前暂存，按时间排序，转为 ApiMessage（LLM 上下文；按 LLM_CONTEXT_SET 过滤，审批不进上下文） */
  loadContextMessages(sessionId: string, convId: string, profile: string): ApiMessage[] {
    // 源1：已完成对话的历史消息（COMPLETED 状态，压缩过的 COMPRESSED 对话不在此列）
    const history = this.messageRepo.findBySessionCompleted(sessionId, profile, 'COMPLETED')
    // 源2：系统摘要（压缩信息，在压缩对话之前，扮演替补历史上下文）
    const summary = this.loadLatestSummaryContent(sessionId, profile)
    // 源3：当前进行中对话的暂存消息（尚未 flush 的数据）
    const current = this.tempMessages.get(convId) ?? []

    // 可见性：只保留 LLM_CONTEXT_SET 内的消息类型（审批/系统摘要等非对话内容排除，对齐 Java TYPE_LLM_CONTEXT_TYPES）
    const inContext = (m: MessageEntity): boolean =>
      m.messageType != null && MSG_TYPE_LLM_CONTEXT_SET.has(m.messageType)

    if (summary) {
      // 合并：summary 最前（最旧）→ 历史中间 → 暂存最后（最新）
      return [summary, ...history.filter(inContext).map(entityToApiMessage), ...current.filter(inContext).map(entityToApiMessage)]
    }

    const all = [...history.filter(inContext), ...current.filter(inContext)]
    all.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || (a.id ?? 0) - (b.id ?? 0))
    return all.map(entityToApiMessage)
  }

  /** 对话完成：暂存消息批量落库，清理暂存 */
  flushConversation(convId: string): void {
    const list = this.tempMessages.get(convId)
    if (!list || list.length === 0) {
      return
    }
    this.messageRepo.saveAll(list)
    this.tempMessages.delete(convId)
  }

  /** 中断 session 下进行中的对话（标记旧 IN_PROGRESS 为已中断） */
  interruptInProgressConversation(sessionId: string): void {
    const inProgress = this.conversationRepo.findInProgress(sessionId)
    if (inProgress) {
      this.conversationRepo.updateStatus(inProgress.id, sessionId, 'INTERRUPTED')
    }
  }

  /** 用户手动删除对话：软删除消息 + 标记对话 DELETED */
  deleteConversation(sessionId: string, convId: string, profile: string): void {
    this.messageRepo.markDeletedByConversations([convId], profile, sessionId)
    this.conversationRepo.updateStatus(convId, sessionId, 'DELETED')
  }

  /** 按对话 ID 删除（controller 入口，内部解析 sessionId） */
  deleteConversationMessages(conversationId: string, profile: string): boolean {
    const conv = this.conversationRepo.findById(conversationId)
    if (!conv) {
      return false
    }
    this.deleteConversation(conv.sessionId, conversationId, profile)
    return true
  }

  /** 按对话 ID 列表加载消息（压缩用） */
  loadConversationsMessages(convIds: string[], sessionId: string, profile: string): ApiMessage[] {
    const entities = this.messageRepo.findByConversationIds(convIds, sessionId, profile)
    return entities.map(entityToApiMessage)
  }

  /** 查找对话实体 */
  findConversationById(conversationId: string) {
    return this.conversationRepo.findById(conversationId)
  }

  /** 获取最新的摘要消息（压缩 + 摘要模块共用入口） */
  loadLatestSummaryContent(sessionId: string, profile: string): ApiMessage | null {
    const msgs = this.messageRepo.findMessagesBySession({
      sessionId,
      profile,
      sortOrder: 'DESC',
      limit: 1,
      roles: [ROLE_SYSTEM],
    })
    if (msgs.length === 0) {
      return null
    }
    const m = msgs[0]
    return {
      role: 'system',
      content: m.content,
    }
  }

  /** 保存或覆盖摘要消息（压缩后） */
  saveSummary(sessionId: string, profile: string, summaryContent: string): void {
    // 删除旧的摘要消息（软删），写入新的
    const existing = this.messageRepo.findMessagesBySession({
      sessionId,
      profile,
      sortOrder: 'DESC',
      limit: 50,
      roles: [ROLE_SYSTEM],
    })
    for (const m of existing) {
      if (m.messageType === MSG_TYPE_SYSTEM_SUMMARY) {
        this.messageRepo.save({ ...m, deleted: true })
      }
    }
    // 摘要消息挂在 session 级（无 conversation）
    this.messageRepo.save({
      sessionId,
      conversationId: null,
      profile,
      role: 'system',
      content: summaryContent,
      reasoningContent: '',
      toolCall: null,
      toolCallId: '',
      toolName: '',
      finishReason: FINISH_COMPLETE,
      interactionStatus: '',
      messageType: MSG_TYPE_SYSTEM_SUMMARY,
      deleted: false,
    })
  }
}

/** MessageEntity → ApiMessage（LLM 协议转换） */
export function entityToApiMessage(m: MessageEntity): ApiMessage {
  const base: ApiMessage = {
    role: m.role as 'system' | 'user' | 'assistant' | 'tool',
    content: m.content ?? '',
  }
  if (m.reasoningContent) {
    base.reasoningContent = m.reasoningContent
  }
  if (m.toolCall) {
    base.toolCall = m.toolCall
  }
  if (m.toolCallId) {
    base.toolCallId = m.toolCallId
  }
  if (m.toolName) {
    base.name = m.toolName
  }
  return base
}
