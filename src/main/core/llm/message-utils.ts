/**
 * message-utils.ts — ApiMessage 序列防御性修复（移植自 showing-agent ApiMessageUtils.repairMessageSequence
 * ——对齐 Hermes Agent repair_message_sequence）
 *
 * 场景：上下文组装后（历史 + 暂存）的防御性清洗——
 * 严格 role 校验的 provider（DeepSeek/Kimi/opencode）会拒绝：
 *   - assistant(tool_calls) 紧跟另一个 assistant 而没有 tool 结果 → HTTP 400
 *     "An assistant message with 'tool_calls' must be followed by tool messages…"
 *   - 游离 tool 消息（tool_call_id 无前置 assistant 配对）
 *   - 相邻 user 消息
 *   - 非首位 system 消息
 *
 * 刻意不回退 "assistant(tool_calls)+tool 对在 user 之前"（上一轮正常完成、用户中途
 * 插入新指令的合法模式）——Pass 1 只在 tool 无配对时丢弃游离 tool——不剥离合法对。
 */
import type { ApiMessage } from './types'

/** toolCall JSON 字符串 → { id: ... } 键集合（解析失败返回空） */
function toolCallKeys(toolCall: unknown): string[] {
  if (typeof toolCall !== 'string' || toolCall === '') return []
  try {
    const parsed = JSON.parse(toolCall) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? Object.keys(parsed) : []
  } catch {
    return []
  }
}

/** 合并两个 toolCall JSON（union——后者的 id 覆盖前者同名） */
function mergeToolCalls(prev: unknown, curr: unknown): string | undefined {
  const a = typeof prev === 'string' && prev !== '' ? (JSON.parse(prev) as Record<string, unknown>) : {}
  const b = typeof curr === 'string' && curr !== '' ? (JSON.parse(curr) as Record<string, unknown>) : {}
  const merged: Record<string, unknown> = { ...(a ?? {}), ...(b ?? {}) }
  return Object.keys(merged).length > 0 ? JSON.stringify(merged) : undefined
}

/** content 拼接（字符串拼接——多模态数组保留后者） */
function concatContent(prev: ApiMessage['content'], curr: ApiMessage['content']): ApiMessage['content'] {
  if (typeof prev === 'string' && typeof curr === 'string') {
    const pc = prev.trim()
    const nc = curr.trim()
    if (pc && nc) return `${pc}\n${nc}`
    return pc || nc
  }
  return typeof curr === 'string' && curr !== '' ? curr : (curr ?? prev)
}

/** 重建 assistant 消息（保留全部字段） */
function buildAssistant(content: ApiMessage['content'], toolCall?: string, reasoningContent?: string, name?: string): ApiMessage {
  const m: ApiMessage = { role: 'assistant', content }
  if (toolCall) m.toolCall = toolCall
  if (reasoningContent) m.reasoningContent = reasoningContent
  if (name) m.name = name
  return m
}

/** toolCall JSON 字符串 → 对象（解析失败返回空对象） */
function toolCallMap(toolCall: unknown): Record<string, unknown> {
  if (typeof toolCall !== 'string' || toolCall === '') return {}
  try {
    const parsed = JSON.parse(toolCall) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** 合并相邻 assistant / 丢弃游离 tool / 合并相邻 user / 修正非首位 system（原地修改） */
export function repairMessageSequence(messages: ApiMessage[]): void {
  if (!messages || messages.length === 0) return

  // ── Pass 0: 合并相邻 assistant（union tool_calls + 拼接 content + 带 reasoningContent）──
  // 两个 assistant 相邻 = 中间没有 tool/user 轮次——tool_calls 后紧跟 assistant 是
  // 严格 provider 的 400 根因（Hermes #29148/#49147）——合并后 tool 消息重新配对
  const pass0: ApiMessage[] = []
  for (const msg of messages) {
    if (!msg) continue
    const prev = pass0.length > 0 ? pass0[pass0.length - 1] : null
    if (prev && msg.role === 'assistant' && prev.role === 'assistant') {
      pass0[pass0.length - 1] = buildAssistant(
        concatContent(prev.content, msg.content),
        mergeToolCalls(prev.toolCall, msg.toolCall),
        prev.reasoningContent || msg.reasoningContent,
        (!prev.name || prev.name === '') && msg.name ? msg.name : prev.name,
      )
      continue
    }
    pass0.push(msg)
  }

  // ── Pass 1: 丢弃游离 tool（tool_call_id 不匹配任何前置 assistant 的 tool_calls）──
  // 消费 id（防重复 tool 消息）；user 消息清空已知集合（新轮次）
  const knownToolIds = new Set<string>()
  const pass1: ApiMessage[] = []
  for (const msg of pass0) {
    if (!msg) continue
    if (msg.role === 'assistant') {
      knownToolIds.clear()
      for (const key of toolCallKeys(msg.toolCall)) knownToolIds.add(key)
      pass1.push(msg)
    } else if (msg.role === 'tool') {
      const tcId = msg.toolCallId
      if (tcId && knownToolIds.has(tcId)) {
        pass1.push(msg)
        knownToolIds.delete(tcId) // 消费——防止重复 tool 消息
      }
    } else {
      if (msg.role === 'user') knownToolIds.clear()
      pass1.push(msg)
    }
  }

  // ── Pass 2: 合并相邻 user 消息（换行分隔——不丢用户输入）──
  const result: ApiMessage[] = []
  for (const msg of pass1) {
    const prev = result.length > 0 ? result[result.length - 1] : null
    if (prev && msg.role === 'user' && prev.role === 'user') {
      result[result.length - 1] = { role: 'user', content: concatContent(prev.content, msg.content) }
      continue
    }
    result.push(msg)
  }

  // ── Pass 3: 非首位 system 修正为交替角色（system 在中间会被 LLM API 拒绝）──
  for (let i = 1; i < result.length; i++) {
    const msg = result[i]
    if (msg.role !== 'system') continue
    const nextRole = i + 1 < result.length ? result[i + 1].role : null
    const desiredRole: ApiMessage['role'] = nextRole === 'assistant' ? 'user' : 'assistant'
    result[i] = {
      role: desiredRole,
      content: msg.content,
      ...(msg.toolCall ? { toolCall: msg.toolCall } : {}),
      ...(msg.toolCallId ? { toolCallId: msg.toolCallId } : {}),
      ...(msg.name ? { name: msg.name } : {}),
      ...(msg.reasoningContent ? { reasoningContent: msg.reasoningContent } : {}),
    }
  }

  // 原地替换
  messages.length = 0
  messages.push(...result)
}

/**
 * 发送前防御性修复（对齐 Hermes sanitize_api_messages——每个 LLM 调用前无条件跑）：
 * - 丢弃无配对的 tool 结果（tool_call_id 无前置 assistant 配对）
 * - 【关键】注入 stub tool 结果：assistant 的 tool_calls 缺对应 tool 消息时——
 *   在 assistant 后补占位 tool（严格 provider 400 "must be followed by tool messages" 根治）
 * - tool 消息按 id 去重（同 id 重复 → 保留第一个）
 * 不改 DB/持久化——只处理发送前的内存副本。
 */
export function sanitizeApiMessages(messages: ApiMessage[]): ApiMessage[] {
  if (!messages || messages.length === 0) return messages

  // 收集 assistant tool_calls ids + tool 结果 ids
  const surviving = new Set<string>()
  const results = new Set<string>()
  const callNameById = new Map<string, string>()
  for (const m of messages) {
    if (m.role === 'assistant') {
      for (const [id, call] of Object.entries(toolCallMap(m.toolCall))) {
        surviving.add(id)
        const name = (call as { name?: string } | null)?.name
        if (name) callNameById.set(id, name)
      }
    } else if (m.role === 'tool' && m.toolCallId) {
      results.add(m.toolCallId)
    }
  }

  // 1. 丢弃无配对 tool 结果
  const orphaned = new Set([...results].filter((id) => !surviving.has(id)))
  let out = orphaned.size > 0
    ? messages.filter((m) => !(m.role === 'tool' && m.toolCallId && orphaned.has(m.toolCallId)))
    : messages

  // 2. 注入 stub：assistant 的 tool_calls 缺对应 tool 结果 → 紧随其后补占位
  const missing = [...surviving].filter((id) => !results.has(id))
  if (missing.length > 0) {
    const patched: ApiMessage[] = []
    for (const m of out) {
      patched.push(m)
      if (m.role === 'assistant') {
        for (const id of Object.keys(toolCallMap(m.toolCall))) {
          if (missing.includes(id)) {
            patched.push({
              role: 'tool',
              content: '[Result unavailable — see context summary above]',
              toolCallId: id,
              ...(callNameById.get(id) ? { name: callNameById.get(id) } : {}),
            })
          }
        }
      }
    }
    out = patched
  }

  // 3. tool 消息按 id 去重（严格 provider 拒绝重复 tool_call_id）
  const seenResultIds = new Set<string>()
  const deduped: ApiMessage[] = []
  for (const m of out) {
    if (m.role === 'tool' && m.toolCallId) {
      if (seenResultIds.has(m.toolCallId)) continue
      seenResultIds.add(m.toolCallId)
    }
    deduped.push(m)
  }
  return deduped
}
