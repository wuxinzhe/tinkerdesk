/**
 * time.ts — 系统时间工具类
 *
 * 统一获取系统时间的入口，main 包内所有时间获取统一走这里。
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
