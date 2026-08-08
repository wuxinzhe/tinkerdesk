/**
 * utils/json-utils.ts — JSON 处理工具
 *
 * - safeParseJson：安全解析 JSON
 *   从 openai-client / anthropic-client 抽取（LLM 工具调用参数解析）
 */

/** 安全解析 JSON：空串/非法返回 {} */
export function safeParseJson(raw: string): Record<string, unknown> {
  if (!raw || raw.trim() === '') {
    return {}
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}
