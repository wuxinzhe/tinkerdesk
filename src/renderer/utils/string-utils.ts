/**
 * utils/string-utils.ts — 字符串处理工具
 *
 * - truncateText：文本截断（尾部追加省略号）
 */

/** 文本截断：超过 max 字符时截断并追加 '...'（默认 200） */
export function truncateText(text: string, max = 200): string {
  const t = (text || '').trim()
  return t.length > max ? `${t.slice(0, max)}...` : t
}
