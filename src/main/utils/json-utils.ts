/**
 * utils/json-utils.ts — JSON 处理工具
 *
 * - safeParseJson: safely parse JSON
 *   (extracted from openai-client / anthropic-client — LLM tool-call arg parsing)
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
