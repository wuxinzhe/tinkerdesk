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
  await call('Runtime.evaluate', { expression: `(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 5 && getComputedStyle(e).overflowY === 'auto')
    if (el) el.scrollTop = 200
    return el ? (el.className || el.tagName).toString() : 'none'
  })()` })
  await new Promise((r) => setTimeout(r, 300))
  const shot = await call('Page.captureScreenshot', { format: 'png' })
  const fs = await import('fs')
  fs.writeFileSync('C:/Users/Administrator/Documents/tinkerdesk/scripts/scrollbar-check.png', Buffer.from(shot.data, 'base64'))
  console.log('截图OK')
  ws.close()
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1) })
