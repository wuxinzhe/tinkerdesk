async function main() {
  const targets = await fetch('http://127.0.0.1:9222/json').then((r) => r.json())
  const page = targets.find((t) => t.type === 'page' && !/devtools/i.test(t.url))
  if (!page) throw new Error('no page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res) => (ws.onopen = res))
  let id = 0
  const call = (method, params) => new Promise((res) => {
    const myId = ++id
    const handler = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id === myId) { ws.removeEventListener('message', handler); res(msg.result) }
    }
    ws.addEventListener('message', handler)
    ws.send(JSON.stringify({ id: myId, method, params }))
  })
  // 拉 vite 编译后的模块（看 setSessionStage 是否含日志）
  const r = await call('Runtime.evaluate', {
    expression: `(async () => {
      const res = await fetch('/src/renderer/stores/chat-store.ts')
      const text = await res.text()
      const hasSetLog = text.includes('[stage] set')
      const hasActionLog = text.includes('[stage] action=')
      // 截取 setSessionStage 函数片段
      const idx = text.indexOf('function setSessionStage')
      const snippet = idx >= 0 ? text.slice(idx, idx + 260) : 'not found'
      return JSON.stringify({ hasSetLog, hasActionLog, snippet })
    })()`,
    awaitPromise: true, returnByValue: true
  })
  console.log(r.result?.value)
  ws.close()
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1) })
