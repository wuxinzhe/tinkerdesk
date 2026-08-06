/**
 * utils/streaming/tool-call-merge.ts — 流式工具调用合并工具
 *
 * LLM 流式返回的 tool_calls 增量（按 index 分片），合并为完整工具调用 map。
 * 纯函数，不依赖任何状态（从 chat-store 抽取）。
 */

/** 流式工具调用分片（LLM delta 结构） */
export interface ToolCallChunk {
  index?: number
  id?: string
  name?: string
  arguments?: unknown
}

/**
 * 合并工具调用分片：按 index 聚合（id/name 取首次出现，arguments 增量拼接）。
 * 返回 id → { name, arguments } 的完整 map。
 *
 * - 字符串 arguments 增量拼接后 JSON.parse（解析失败保留原串，便于排查）
 * - 非流式完整对象（argsObj）仅在无字符串片段时兜底，避免空对象覆盖真实增量
 */
export function mergeToolCallChunks(arr: ToolCallChunk[]): Record<string, { name: string; arguments: unknown }> {
  // 按 index 合并：id/name 取首次出现，arguments 增量拼接
  const byIndex = new Map<number, { id?: string; name?: string; args: string; argsObj?: unknown }>()
  for (const item of arr) {
    const idx = typeof item?.index === 'number' ? item.index : 0
    const cur = byIndex.get(idx) ?? { args: '' }
    if (item.id) cur.id = item.id
    if (item.name) cur.name = item.name
    if (typeof item.arguments === 'string') {
      cur.args += item.arguments
    } else if (item.arguments && typeof item.arguments === 'object' && cur.argsObj === undefined) {
      // 非流式/已 parse 的完整对象——只在未设置时使用（流式首 chunk 可能是空对象，后续字符串增量才是真参数）
      cur.argsObj = item.arguments
    }
    byIndex.set(idx, cur)
  }

  const result: Record<string, { name: string; arguments: unknown }> = {}
  for (const { id, name, args, argsObj } of byIndex.values()) {
    if (!id || !name) continue
    // 优先用拼接的字符串（流式增量）——parse 成功即为完整参数；
    // argsObj 仅在没有任何字符串片段时兜底（避免空对象覆盖真实增量）
    let parsed: unknown = {}
    if (args) {
      try {
        parsed = JSON.parse(args)
      } catch {
        // 解析失败保留原串（工具层会给出参数校验错误，便于排查）
        parsed = args
      }
    } else if (argsObj) {
      parsed = argsObj
    }
    result[id] = { name, arguments: parsed }
  }
  return result
}
