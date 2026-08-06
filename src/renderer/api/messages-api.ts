/**
 * messages.api.ts — 数据层
 * 消息查询与删除 API（本地 IPC，走 MessageController）
 */
import type { Message } from '@/renderer/api/types'
import '@/renderer/api/types'

export class MessagesApi {
  async listBySession(sessionId: string, limit = 50, offset = 0): Promise<Message[]> {
    const data = await window.api.messages.bySession(sessionId, 'default', limit, offset)
    return normalizeMessages((data as Message[]) ?? [])
  }

  async listByConversation(conversationId: string): Promise<Message[]> {
    const data = await window.api.messages.byConversation(conversationId, 'default')
    return normalizeMessages((data as Message[]) ?? [])
  }

  /**
   * 原文模式专用：返回未 normalize 的原始消息。
   * normalizeMessages 会把 toolCall map 拆成第一个 ToolCall 对象（keys[0]），
   * 多组工具调用时第二组起全部丢失——原文详情页需要完整原始数据。
   */
  async listByConversationRaw(conversationId: string): Promise<Message[]> {
    const data = await window.api.messages.byConversation(conversationId, 'default')
    return (data as Message[]) ?? []
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await window.api.messages.deleteConversation(conversationId, 'default')
  }
}

/**
 * 标准化从后端返回的消息列表：
 * 1. 对 clarify_request 消息，从 toolCall JSON 中解析 question/choices
 * 2. 对所有消息，将 toolCall JSON string parse 为 ToolCall 对象
 */
function normalizeMessages(msgs: Message[]): Message[] {
  return msgs.map(m => {
    // ── 将 toolCall JSON string → ToolCall 对象 ──
    if (typeof m.toolCall === 'string') {
      try {
        const parsed = JSON.parse(m.toolCall) as Record<string, unknown>
        // 格式: { [toolCallId]: { name, arguments } }
        const keys = Object.keys(parsed)
        const id = keys[0] || m.toolCallId || ''
        const entry = parsed[id] as Record<string, unknown> | undefined
        if (entry && typeof entry === 'object') {
          m = {
            ...m,
            toolCall: {
              id,
              name: (entry['name'] as string) ?? '',
              arguments: (entry['arguments'] as Record<string, unknown>) ?? {},
              status: 'completed'
            }
          }
        }
      } catch { /* keep raw string */ }
    }

    // ── 对 clarify_request 额外解析 question/choices ──
    if (m.messageType !== 'clarify_request') return m
    if (m.clarifyQuestion && m.clarifyChoices) return m
    const tc = m.toolCall
    if (!tc) return m

    try {
      const toolCallStr = typeof tc === 'string' ? tc : JSON.stringify(tc)
      if (!toolCallStr) return m

      const parsed = JSON.parse(toolCallStr) as Record<string, unknown>
      const keys = Object.keys(parsed)
      const firstEntry = Object.values(parsed)[0] as Record<string, unknown> | undefined
      if (!firstEntry) return m

      const args = firstEntry['arguments'] as Record<string, unknown> | undefined
      if (!args) return m

      return {
        ...m,
        toolCallId: keys[0] || m.toolCallId || '',
        clarifyQuestion: (args['question'] as string) ?? '',
        clarifyChoices: (args['choices'] as string[]) ?? null
      } as Message
    } catch {
      return m
    }
  })
}

/** 默认实例 */
export const messagesApi = new MessagesApi()
