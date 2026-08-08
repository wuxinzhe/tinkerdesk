/**
 * useConversationCards.ts — 将消息翻页接口响应聚合为对话预览卡片
 *
 * 数据源：GET /messages/session/{sessionId}（已实现）
 * 聚合规则：
 * - 跳过非对话类型（system_summary、approval、file_upload 等）
 * - 按 conversationId 分组
 * - 每张卡片 = 该轮对话的用户消息 + 助手回复摘要
 */
import { ref } from 'vue'
import { messagesApi } from '@/renderer/api/messages-api'
import { useSessionStore } from '@/renderer/stores/session-store'
import type { Message } from '@/renderer/api/types'
import type { ConversationCard } from './types'
import { truncateText } from '@/renderer/utils/string-utils'
export type { ConversationCard } from './types'

/** 跳过非对话类型的消息 */
const NON_DIALOG_TYPES = new Set([
  'system_summary',
  'approval',
  'approval_request',
  'file_upload',
  'agent_response',
  'tool_call',
  'tool_result',
])

function shouldIncludeInPreview(m: Message): boolean {
  if (!m.conversationId) return false
  if (m.messageType && NON_DIALOG_TYPES.has(m.messageType)) return false
  return true
}

/** 单条消息 → 卡片 */
function buildCard(convId: string, msgs: Message[]): ConversationCard {
  const ordered = [...msgs].sort((a, b) => a.timestamp - b.timestamp)
  const userMsg = ordered.find(m => m.role === 'user')
  const assistantMsg = ordered.find(m => m.role === 'assistant')

  return {
    conversationId: convId,
    userContent: truncateText(userMsg?.content ?? ''),
    replyPreview: truncateText(assistantMsg?.content ?? ''),
    messageCount: ordered.length,
    hasToolCalls: msgs.some(m => m.messageType === 'tool_call' || !!m.toolCallId),
    timestamp: userMsg?.timestamp ?? msgs[0]?.timestamp ?? Date.now(),
  }
}

/** API 响应 → 卡片数组（按时间倒序） */
export function groupByConversation(messages: Message[]): ConversationCard[] {
  const map = new Map<string, Message[]>()
  for (const msg of messages) {
    if (!shouldIncludeInPreview(msg)) continue
    if (!msg.conversationId) continue
    if (!map.has(msg.conversationId)) map.set(msg.conversationId, [])
    map.get(msg.conversationId)!.push(msg)
  }
  return Array.from(map.entries())
    .map(([convId, msgs]) => buildCard(convId, msgs))
    .sort((a, b) => b.timestamp - a.timestamp)
}

/**
 * 预览列表状态：翻页快照 + 无限滚动。
 * 每页 50 条消息，按 convId 去重合并。
 */
export function useConversationCards() {
  const sessionStore = useSessionStore()
  const cards = ref<ConversationCard[]>([])
  const loading = ref(false)
  const hasMore = ref(true)
  const offset = ref(0)
  const error = ref('')

  async function loadPage(sessionId: string): Promise<void> {
    if (loading.value || !hasMore.value || !sessionId) return
    loading.value = true
    error.value = ''
    try {
      const messages = await messagesApi.listBySession(sessionId, sessionStore.profile ?? 'default', 50, offset.value)
      const newCards = groupByConversation(messages)
      mergeByConvId(cards.value, newCards)
      offset.value += 50
      hasMore.value = messages.length >= 50
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载失败'
    } finally {
      loading.value = false
    }
  }

  function reset(): void {
    cards.value = []
    offset.value = 0
    hasMore.value = true
    loading.value = false
    error.value = ''
  }

  return { cards, loading, hasMore, error, loadPage, reset }
}

/** 按 convId 去重合并（保留已有卡片顺序，新增追加尾部） */
function mergeByConvId(target: ConversationCard[], incoming: ConversationCard[]): void {
  const existing = new Set(target.map(c => c.conversationId))
  for (const card of incoming) {
    if (!existing.has(card.conversationId)) {
      target.push(card)
      existing.add(card.conversationId)
    }
  }
}
