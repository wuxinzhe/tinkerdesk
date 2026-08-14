/**
 * time.ts — 系统时间工具类
 *
 * Unified system-time entry; all time acquisition in the main package goes through here.
 * 三种格式：
 * - nowDb()   — SQLite 存储格式（'YYYY-MM-DD HH:MM:SS'，UTC）
 * - nowIso()  — ISO 8601 字符串
 * - nowTs()   — Unix 毫秒时间戳
 */

/** SQLite 存储格式：'YYYY-MM-DD HH:MM:SS'（UTC） */
export function nowDb(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

/** ISO 8601 字符串 */
export function nowIso(): string {
  return new Date().toISOString()
}

/** Unix 毫秒时间戳 */
export function nowTs(): number {
  return Date.now()
}

/** 日期（YYYY-MM-DD，UTC），用于提示词 date 变量 */
export function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}
