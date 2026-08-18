/**
 * agent-worker-main.ts — Agent 进程入口（utilityProcess——独立 Node 进程，进程级隔离）
 *
 * 生命周期：主进程 AgentWorkerHost.spawn() 拉起本进程，经 process.parentPort 双向消息：
 * - 启动即向主进程回 `ready`
 * - 收 `ping` 回 `pong`（连通性自检）
 * - 后续（M2b+）：收 `agent:prompt` 跑 conversation；回 `chat:stream` / `agent:done` / `persist:flush` 等
 *
 * utilityProcess 内无 window/renderer——纯 Node 上下文，可直接构造 llmRouter/conversation。
 */
type WorkerMsg = { type: string; sessionId?: string; profile?: string; [k: string]: unknown }

const port = process.parentPort
if (!port) {
  throw new Error('agent-worker-main 必须运行在 utilityProcess 中（process.parentPort 不存在）')
}

function send(msg: WorkerMsg): void {
  port.postMessage(msg)
}

port.on('message', (e: { data?: WorkerMsg }) => {
  const msg = (e as { data?: WorkerMsg }).data
  if (!msg) return
  switch (msg.type) {
    case 'ping':
      send({ type: 'pong', sessionId: msg.sessionId })
      break
    default:
      // M2b+ 扩展：agent:prompt / cancel / interrupt / approval:decide ...
      send({ type: 'unknown', typeName: msg.type })
  }
})

// 启动就绪信号
send({ type: 'ready' })
