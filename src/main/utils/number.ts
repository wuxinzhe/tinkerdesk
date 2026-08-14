/**
 * utils/number.ts — 数字工具函数
 *
 * Numeric helpers:
 * - coerceInt: lenient integer conversion (number/string → int, falls back on invalid)
 * - normalizeReadPagination / normalizeSearchPagination：分页归一化
 * 被 read-file-tool / search-files-tool 共享。
 */

/** 宽松整数转换：number 直接截断；string 解析；非法回退 fallback */
export function coerceInt(value: unknown, fallback: number): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : fallback
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.trunc(n)
  }
  return fallback
}

/** read_file 分页归一化（offset max(1, int)；limit clamp [1, maxLines]） */
export function normalizeReadPagination(
  offset: unknown,
  limit: unknown,
  defaultOffset = 1,
  defaultLimit = 500,
  maxLines = 2000
): [number, number] {
  const normalizedOffset = Math.max(1, coerceInt(offset, defaultOffset))
  const normalizedLimit = coerceInt(limit, defaultLimit)
  return [normalizedOffset, Math.max(1, Math.min(normalizedLimit, maxLines))]
}

/** search 分页归一化（offset max(0, int)；limit clamp [1, maxLimit]） */
export function normalizeSearchPagination(
  offset: unknown,
  limit: unknown,
  defaultOffset = 0,
  defaultLimit = 50,
  maxLimit = 2000
): [number, number] {
  const normalizedOffset = Math.max(0, coerceInt(offset, defaultOffset))
  const normalizedLimit = coerceInt(limit, defaultLimit)
  return [normalizedOffset, Math.max(1, Math.min(normalizedLimit, maxLimit))]
}
