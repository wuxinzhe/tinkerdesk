/**
 * utils/message-utils.ts — 消息类型推断工具
 *
 * - inferMessageTypeFromRole：消息 role → messageType 映射（旧数据无 messageType 时兜底）
 */

/** role → messageType */
export function inferMessageTypeFromRole(role: string): string {
  if (role === 'user') return 'user_normal'
  if (role === 'assistant') return 'assistant_text'
  if (role === 'approval') return 'approval_request'
  if (role === 'system') return 'assistant_text'
  if (role === 'tool') return 'tool_result'
  return ''
}
