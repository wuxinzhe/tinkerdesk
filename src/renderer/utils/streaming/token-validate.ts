/**
 * utils/streaming/token-validate.ts — 流式 token 有效性校验
 *
 * 防御性编程：服务端/LLM 可能把"空值"序列化成各种形态，一律视为无效不接收：
 * - null / undefined
 * - 空字符串 ''
 * - 纯空白 '   '
 * - 字面量字符串 'null' / 'undefined'（DeepSeek 思考结束会把空思考序列化成 "null"）
 */

/** 流式 token 有效性校验（从 chat-store 抽取） */
export function isValidTokenValue(v: unknown): v is string {
  if (v === null || v === undefined) return false
  if (typeof v !== 'string') return false
  const t = v.trim()
  return t.length > 0 && t !== 'null' && t !== 'undefined'
}
