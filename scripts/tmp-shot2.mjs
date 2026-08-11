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
  // 当前 URL + 可见性
  const r0 = await call('Runtime.evaluate', { expression: `JSON.stringify({ url: location.hash, title: document.title, vis: document.visibilityState, bodyChildren: document.body.children.length })`, returnByValue: true })
  console.log('页面状态:', r0.result?.value)
  // 已在工具页则等渲染；不在则导航
  if (!String(r0.result?.value).includes('/tools')) {
    await call('Page.navigate', { url: 'http://localhost:5173/#/workspace/agents/default/tools' })
    await new Promise((r) => setTimeout(r, 3000))
  } else {
    await new Promise((r) => setTimeout(r, 1000))
  }
  // DOM 确认
  const r1 = await call('Runtime.evaluate', {
    expression: `(() => {
      const tabs = [...document.querySelectorAll('.tools-tab')].map(t => t.textContent.trim())
      const rows = document.querySelectorAll('.tool-row').length
      const hero = document.querySelector('.sa-page-hero') ? document.querySelector('.sa-page-hero').textContent.trim().slice(0, 30) : '无 hero'
      return JSON.stringify({ tabs, rows, hero, loading: !!document.querySelector('.tools-loading'), empty: !!document.querySelector('.tools-empty') })
    })()`,
    returnByValue: true
  })
  console.log('DOM:', r1.result?.value)
  // 截图
  const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  const { writeFileSync } = await import('fs')
  writeFileSync('C:/Users/Administrator/Documents/tinkerdesk/scripts/tmp-tools-shot2.png', Buffer.from(shot.data, 'base64'))
  console.log('截图2 已保存, 大小:', shot.data.length)
  ws.close()
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1) })
