/**
 * cdp-tool-log.cjs — 观察 Electron 工具链路日志
 *
 * 直连 Electron CDP（9222），订阅 renderer 的 console 输出，
 * 过滤 [tool] / [renderer] 工具链路日志，实时打印到 stdout。
 *
 * 用法：node scripts/cdp-tool-log.cjs
 */
const http = require('http')
const WebSocket = require('ws')

const CDP_PORT = process.env.CDP_PORT || 9222
const FILTER = process.env.FILTER || ''

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${CDP_PORT}/json`, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

async function main() {
  const targets = await getTargets()
  const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'))
  if (!page) {
    console.error(`[cdp] 未找到页面 target（9222 端口 ${CDP_PORT}）`)
    process.exit(1)
  }
  console.log(`[cdp] 连接: ${page.title} @ ${page.url.slice(0, 60)}`)

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }))

  ws.on('open', () => {
    send('Runtime.enable')
    send('Console.enable')
    console.log('[cdp] 已订阅 console，等待工具调用日志（Ctrl+C 退出）...')
  })

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString())
    if (msg.method === 'Runtime.consoleAPICalled') {
      const args = (msg.params.args || [])
        .map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type || ''))
        .join(' ')
      if (!args.includes('[tool]') && !args.includes('[renderer]')) return
      if (FILTER && !args.includes(FILTER)) return
      const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      console.log(`[${ts}] ${args}`)
    }
  })

  ws.on('error', (err) => {
    console.error(`[cdp] WebSocket 错误: ${err.message}`)
    process.exit(1)
  })
  ws.on('close', () => {
    console.error('[cdp] 连接关闭（Electron 重启了？重新运行脚本）')
    process.exit(0)
  })
}

main().catch((e) => {
  console.error(`[cdp] 启动失败: ${e.message}`)
  process.exit(1)
})
