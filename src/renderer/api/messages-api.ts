/**
 * messages.api.ts — 数据层
 * 消息查询与删除 API（本地 IPC，走 MessageController）
 */
import type { Message } from '@/renderer/api/types'
import '@/renderer/api/types'

export class MessagesApi {
  async listBySession(sessionId: string, profile: string, limit = 50, offset = 0): Promise<Message[]> {
    const data = await window.api.messages.bySession(sessionId, profile, limit, offset)
    return normalizeMessages((data as Message[]) ?? [])
  }

  async listByConversation(conversationId: string, profile: string): Promise<Message[]> {
    const data = await window.api.messages.byConversation(conversationId, profile)
    return normalizeMessages((data as Message[]) ?? [])
  }

  /**
   * 原文模式专用：返回未 normalize 的原始消息。
   * normalizeMessages 会把 toolCall map 拆成第一个 ToolCall 对象（keys[0]），
   * 多组工具调用时第二组起全部丢失——原文详情页需要完整原始数据。
   */
  async listByConversationRaw(conversationId: string, profile: string): Promise<Message[]> {
    const data = await window.api.messages.byConversation(conversationId, profile)
    return (data as Message[]) ?? []
  }

  async deleteConversation(conversationId: string, profile: string): Promise<void> {
    await window.api.messages.deleteConversation(conversationId, profile)
  }
}

/**
 * 标准化从后端返回的消息列表：
 * 1. 对 clarify_request 消息，从 toolCall JSON 中解析 question/choices
 * 2. 对所有消息，将 toolCall JSON string parse 为 ToolCall 对象
 */
function normalizeMessages(msgs: Message[]): Message[] {
  return msgs.map(m => {
    // ── 将 toolCall JSON string → 完整 map 对象 ──
    // 保留全部工具调用（多工具：{call_0:{name,arguments}, call_1:{...}}）——
    // MessageBubble parseToolCallEntries 支持 map 渲染多胶囊；不拆第一个
    if (typeof m.toolCall === 'string') {
      try {
        const parsed = JSON.parse(m.toolCall) as Record<string, unknown>
        const keys = Object.keys(parsed)
        if (keys.length > 0 && parsed[keys[0]] && typeof parsed[keys[0]] === 'object') {
          m = { ...m, toolCall: parsed as Message['toolCall'] }
        }
      } catch { /* keep raw string */ }
    }

    // ── 对 clarify_request 额外解析 question/choices ──
    if (m.messageType !== 'clarify_request') return m
    if (m.clarifyQuestion && m.clarifyChoices) return m
    const tc = m.toolCall
    if (!tc) return m

    // 兼容三种 toolCall 形态：
    //  1) 原始格式（string）: { [callId]: { name, arguments } }
    //  2) 已转换格式（对象·平铺）: { id, name, arguments, status }（单工具）
    //  3) 已转换格式（对象·map）: { [callId]: { name, arguments } }（多工具——取第一个）
    let args: Record<string, unknown> | undefined
    if (typeof tc === 'string') {
      try {
        const parsed = JSON.parse(tc) as Record<string, unknown>
        const firstEntry = Object.values(parsed)[0] as Record<string, unknown> | undefined
        args = firstEntry?.['arguments'] as Record<string, unknown> | undefined
      } catch {
        return m
      }
    } else if ((tc as unknown as Record<string, unknown>)['name']) {
      args = (tc as unknown as { arguments?: Record<string, unknown> })['arguments']
    } else {
      // map 对象（多工具）：取第一个 entry 的 arguments
      const firstEntry = Object.values(tc as Record<string, unknown>)[0] as Record<string, unknown> | undefined
      args = firstEntry?.['arguments'] as Record<string, unknown> | undefined
    }
    if (!args) return m

    return {
      ...m,
      clarifyQuestion: (args['question'] as string) ?? '',
      clarifyChoices: (args['choices'] as string[]) ?? null
    } as Message
  })
}

/** 默认实例 */
export const messagesApi = new MessagesApi()
