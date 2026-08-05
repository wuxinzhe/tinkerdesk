/**
 * message-service.ts — 消息服务层
 *
 * 复刻 showing-agent IMessageService（本地单用户版）：
 * - 两层存储：进行中消息暂存（内存）+ 完成后落库（SQLite）
 * - loadContextMessages：合并历史 + 当前暂存，供 LLM 上下文构建
 * - 审批状态更新、对话删除、摘要保存
 */
import {MessageRepository} from '../repository/message-repository'
import type {MessageEntity} from '../repository/types'
import {ConversationRepository} from '../repository/conversation-repository'
import type {ApiMessage} from '../llm/types'

/** 消息类型常量（对齐 showing-agent MessageConstants） */
export const MSG_TYPE_USER = 'user_message'
export const MSG_TYPE_ASSISTANT_TEXT = 'assistant_text'
export const MSG_TYPE_ASSISTANT_TOOL_CALL = 'assistant_tool_call'
export const MSG_TYPE_ASSISTANT_THINKING = 'assistant_thinking'
export const MSG_TYPE_TOOL_RESULT = 'tool_result'
export const MSG_TYPE_APPROVAL_REQUEST = 'approval_request'
export const MSG_TYPE_SUMMARY = 'summary'

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
      finishReason: 'complete',
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
      finishReason: 'complete',
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
    toolCalls: Record<string, {name: string; arguments: unknown}>
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
      finishReason: 'tool_calls',
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
      finishReason: 'complete',
      interactionStatus: '',
      messageType: MSG_TYPE_ASSISTANT_THINKING,
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
      finishReason: 'complete',
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
  ) {}

  /** 保存消息到暂存（对话进行中） */
  saveTempMessage(entity: MessageEntity): void {
    const convId = entity.conversationId ?? ''
    const list = this.tempMessages.get(convId) ?? []
    list.push(entity)
    this.tempMessages.set(convId, list)
  }

  /** 更新审批状态（approved/rejected） */
  updateApprovalMessageStatusTemp(convId: string, toolCallId: string, approved: boolean, profile: string, sessionId: string): void {
    // 暂存区查找匹配消息更新
    const list = this.tempMessages.get(convId) ?? []
    for (const m of list) {
      if (m.role === 'approval' && m.toolCallId === toolCallId) {
        m.interactionStatus = approved ? 'approved' : 'rejected'
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

  /** 按 session 分页查询消息 */
  listMessagesBySession(sessionId: string, profile: string, limit: number, offset: number): MessageEntity[] {
    return this.messageRepo.findMessagesBySession({
      sessionId,
      profile,
      sortOrder: 'ASC',
      limit,
    }).slice(offset)
  }

  /** 按 conversation 查询全部消息 */
  listMessagesByConversation(conversationId: string, profile: string): MessageEntity[] {
    return this.messageRepo.findByConditions({conversationId, profile})
  }

  /** 合并历史 + 当前暂存，按时间排序，转为 ApiMessage（LLM 上下文） */
  loadContextMessages(sessionId: string, convId: string, profile: string): ApiMessage[] {
    // 源1：已完成对话的历史消息（COMPLETED 状态，压缩过的 COMPRESSED 对话不在此列）
    const history = this.messageRepo.findBySessionCompleted(sessionId, profile, 'COMPLETED')
    // 源2：系统摘要（压缩信息，在压缩对话之前，扮演替补历史上下文）
    const summary = this.loadLatestSummaryContent(sessionId, profile)
    // 源3：当前进行中对话的暂存消息（尚未 flush 的数据）
    const current = this.tempMessages.get(convId) ?? []

    if (summary) {
      // 合并：summary 最前（最旧）→ 历史中间 → 暂存最后（最新）
      return [summary, ...history.map(entityToApiMessage), ...current.map(entityToApiMessage)]
    }

    const all = [...history, ...current]
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
      roles: ['system'],
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
      roles: ['system'],
    })
    for (const m of existing) {
      if (m.messageType === MSG_TYPE_SUMMARY) {
        this.messageRepo.save({...m, deleted: true})
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
      finishReason: 'complete',
      interactionStatus: '',
      messageType: MSG_TYPE_SUMMARY,
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
