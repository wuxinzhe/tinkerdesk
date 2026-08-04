const http = require('http')
const WebSocket = require('ws')
http.get('http://localhost:9222/json', (res) => {
  let data = ''
  res.on('data', (c) => (data += c))
  res.on('end', () => {
    const page = JSON.parse(data).find((t) => t.type === 'page' && t.url.includes('5173'))
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    ws.on('open', () => {
      const expr = `(() => {
        const bar = document.querySelector('.workspace-toolbar--l3')
        if (!bar) return 'NO L3 BAR'
        const title = bar.querySelector('.workspace-toolbar__title')
        const center = bar.querySelector('.workspace-toolbar__center')
        const actions = bar.querySelector('.workspace-toolbar__actions')
        const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width), text: (el.textContent || '').slice(0, 30) } }
        return JSON.stringify({
          bar: r(bar),
          title: title ? r(title) : null,
          center: center ? r(center) : null,
          actions: actions ? r(actions) : null,
          barOverflow: getComputedStyle(bar).overflow,
          barScrollW: bar.scrollWidth, barClientW: bar.clientWidth
        }, null, 1)
      })()`
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }))
    })
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw)
      if (msg.id === 1) { console.log(msg.result.result.value ?? JSON.stringify(msg.result)); ws.close(); process.exit(0) }
    })
    setTimeout(() => process.exit(1), 5000)
  })
})
