/**
 * utils/streaming/token-validate.ts — 流式 token 有效性校验
 *
 * 防御性编程：服务端/LLM 可能把"空值"序列化成各种形态，一律视为无效不接收：
 * - null / undefined
 * - 空字符串 ''
 * - 字面量字符串 'null' / 'undefined'（DeepSeek 思考结束会把空思考序列化成 "null"）
 *
 * ⚠ 不能按 trim 后是否为空判断：纯换行 token（"\n"/"\n\n"）是 Markdown 结构关键
 *   （标题/段落分隔），过滤掉会导致标题粘连（"# 标题\n\n## 标题" → "# 标题## 标题"）。
 */

/** 流式 token 有效性校验（从 chat-store 抽取） */
export function isValidTokenValue(v: unknown): v is string {
  if (v === null || v === undefined) return false
  if (typeof v !== 'string') return false
  if (v.length === 0) return false
  return v !== 'null' && v !== 'undefined'
}
