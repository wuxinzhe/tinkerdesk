/** 模拟：服务端 serializeToolCall（每 chunk 一个 JSON 对象）→ 前端 join → wrapped → assembleToolCalls */
const MAPPER = JSON

// ── 服务端：模拟 DeepSeek 流式 tool_calls delta → serializeToolCall（每 chunk 输出对象）──
// DeepSeek 增量：arguments 逐 token 片
const deltas = [
  { index: 0, id: 'call_abc123', name: 'desktop_showing_web_search', arguments: '{"query":' },
  { index: 0, arguments: '"opencode' },
  { index: 0, arguments: ' github' },
  { index: 0, arguments: ' AI"' },
  { index: 0, arguments: '}' },
]
function serializeToolCall(tc) {
  const partial = { index: tc.index }
  if (tc.id) partial.id = tc.id
  if (tc.name) partial.name = tc.name
  if (tc.arguments !== undefined) partial.arguments = tc.arguments
  return JSON.stringify(partial)
}
const pieces = deltas.map(serializeToolCall)
console.log('── 服务端逐片下发（每片一个对象）──')
pieces.forEach((p, i) => console.log(`[${i}] ${p}`))

// ── 前端：join ──
const raw = pieces.join('')
console.log('\n── join 结果 ──')
console.log(raw)

// ── 前端 parse 分支 ──
function assembleToolCalls(arr) {
  const byIndex = new Map()
  for (const item of arr) {
    const idx = typeof item?.index === 'number' ? item.index : 0
    const cur = byIndex.get(idx) ?? { args: '' }
    if (item.id) cur.id = item.id
    if (item.name) cur.name = item.name
    if (typeof item.arguments === 'string') cur.args += item.arguments
    else if (item.arguments && typeof item.arguments === 'object') cur.argsObj = item.arguments
    byIndex.set(idx, cur)
  }
  const byId = {}
  for (const { id, name, args, argsObj } of byIndex.values()) {
    if (!id || !name) continue
    let parsed = argsObj ?? {}
    if (!argsObj && args) { try { parsed = JSON.parse(args) } catch { parsed = args } }
    byId[id] = { name, arguments: parsed }
  }
  return byId
}

let result
try {
  const parsed = JSON.parse(raw)
  result = Array.isArray(parsed) ? assembleToolCalls(parsed) : parsed.id && parsed.name ? assembleToolCalls([parsed]) : null
} catch {
  try {
    const wrapped = JSON.parse('[' + raw.replace(/}{/g, '},{') + ']')
    console.log('\n── wrapped 数组 ──')
    console.log(JSON.stringify(wrapped, null, 1))
    result = assembleToolCalls(wrapped)
  } catch (e) {
    console.log('\n── wrapped 也失败:', e.message)
    console.log('wrapped 字符串:', '[' + raw.replace(/}{/g, '},{') + ']')
    result = null
  }
}
console.log('\n── 最终组装 byId ──')
console.log(JSON.stringify(result, null, 1))
if (result && result['call_abc123']) {
  const args = result['call_abc123'].arguments
  console.log('\n── 工具拿到的参数 ──')
  console.log('typeof:', typeof args, '值:', JSON.stringify(args))
  console.log('params.query:', typeof args === 'object' ? args.query : '(非对象→undefined)')
}
