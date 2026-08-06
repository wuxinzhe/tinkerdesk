/**
 * renderer/composables/types.ts — 组合式函数包类型定义
 *
 * 各 composable 的对外类型统一归位（ConversationCard），
 * 实现文件从本文件导入。
 */

/** 对话预览卡片（按 conversationId 聚合的消息预览） */
export interface ConversationCard {
  conversationId: string
  userContent: string
  replyPreview: string
  messageCount: number
  hasToolCalls: boolean
  timestamp: number
}
