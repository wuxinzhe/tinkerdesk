/** 验证 yolo GET/PUT 全链路：从 Electron 拿 token → GET 状态 → PUT 切换 → GET 确认 */
const http = require('http')
const WebSocket = require('ws')

const SESSION_ID = '92fcffef4ffd40309ee67fe1cbf0426b'

http.get('http://localhost:9222/json', (res) => {
  let data = ''
  res.on('data', (c) => (data += c))
  res.on('end', () => {
    const pages = JSON.parse(data)
    const page = pages.find((p) => p.type === 'page')
    if (!page) return console.log('no page')
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    let id = 0
    const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }))
    ws.on('open', () => {
      send('Runtime.evaluate', {
        expression: `localStorage.getItem('access_token') || localStorage.getItem('token') || ''`,
        returnByValue: true
      })
    })
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw)
      if (msg.id === 1 && msg.result) {
        const token = msg.result.result.value
        if (!token) return console.log('NO_TOKEN')
        const opts = (method) => ({
          method,
          headers: { Authorization: `Bearer ${token}` }
        })
        // GET 当前状态
        http.get(`http://localhost:8080/api/sessions/${SESSION_ID}/yolo`, opts('GET'), (r) => {
          let b = ''
          r.on('data', (c) => (b += c))
          r.on('end', () => {
            console.log('GET yolo:', r.statusCode, b.slice(0, 120))
            // PUT 切换
            const req = http.request(`http://localhost:8080/api/sessions/${SESSION_ID}/yolo`, opts('PUT'), (r2) => {
              let b2 = ''
              r2.on('data', (c) => (b2 += c))
              r2.on('end', () => {
                console.log('PUT yolo:', r2.statusCode, b2.slice(0, 120))
                // 再 GET 确认
                http.get(`http://localhost:8080/api/sessions/${SESSION_ID}/yolo`, opts('GET'), (r3) => {
                  let b3 = ''
                  r3.on('data', (c) => (b3 += c))
                  r3.on('end', () => console.log('GET after PUT:', r3.statusCode, b3.slice(0, 120)))
                })
              })
            })
            req.end()
          })
        })
      }
    })
    setTimeout(() => process.exit(1), 8000)
  })
})
