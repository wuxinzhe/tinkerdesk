/**
 * utils/date-utils.ts — 时间格式化工具（按时间戳 → 展示文本）
 *
 * 从 ChatDetail/MessageBubble/SessionPreviewCard 抽取的 formatTime 系列：
 * - formatClockTime：HH:mm
 * - formatSmartTime：今天 HH:mm / 昨天 HH:mm / M/D HH:mm
 * - formatDateTime：YYYY-MM-DD HH:mm
 */

/** 补零 */
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** HH:mm（小时:分钟） */
export function formatClockTime(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 智能时间：今天 → HH:mm；昨天 → 昨天 HH:mm；更早 → M/D HH:mm */
export function formatSmartTime(ts: number): string {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  const time = formatClockTime(ts)
  if (isToday) return time
  if (isYesterday) return `昨天 ${time}`
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${time}`
}

/** 完整日期时间：YYYY-MM-DD HH:mm */
export function formatDateTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
