/**
 * utils/json-utils.ts — JSON 处理工具
 *
 * - prettyJson：任意值 → 缩进美化文本（兼容"JSON 字符串"旧数据形态）
 * - deepParseJson：深度解析——嵌套的 JSON 字符串（如 toolCall.arguments）递归展开
 */

/** 任意值 → 缩进 2 的 JSON 文本；兼容字符串形态（旧数据曾返回 JSON 字符串） */
export function prettyJson(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') {
    try {
      return JSON.stringify(JSON.parse(v), null, 2)
    } catch {
      return v
    }
  }
  return JSON.stringify(v, null, 2)
}

/** 深度解析：若某值是 JSON 字符串则继续 parse（如 toolCall 的 arguments 嵌套） */
export function deepParseJson(v: unknown): unknown {
  if (typeof v === 'string') {
    const t = v.trim()
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        return deepParseJson(JSON.parse(t))
      } catch {
        return v
      }
    }
    return v
  }
  if (Array.isArray(v)) return v.map(deepParseJson)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = deepParseJson(val)
    }
    return out
  }
  return v
}
