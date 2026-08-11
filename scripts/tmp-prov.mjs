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
  // 1. 语音设置页（voice.tts）
  const r1 = await call('Runtime.evaluate', {
    expression: `(async () => {
      try {
        const v = await window.api.voice.getConfig()
        return 'voice:' + JSON.stringify(v)
      } catch (e) { return 'voice ERR ' + e.message }
    })()`,
    awaitPromise: true, returnByValue: true
  })
  console.log(r1.result?.value)
  // 2. 工具设置页（tool.tts）
  const r2 = await call('Runtime.evaluate', {
    expression: `(async () => {
      try {
        const d = await window.api.audioToolProvider.list('tool.tts')
        return 'tool.tts providers: ' + JSON.stringify(d?.providers?.map(p => p.pluginId))
      } catch (e) { return 'tool.tts ERR ' + e.message }
    })()`,
    awaitPromise: true, returnByValue: true
  })
  console.log(r2.result?.value)
  ws.close()
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1) })
