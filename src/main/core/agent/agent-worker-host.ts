/**
 * agent-worker-host.ts — Agent 进程宿主（主进程侧）
 *
 * 每个活跃会话对应一个隔离 AgentWorker 进程（utilityProcess）——进程级隔离：
 * 多 profile/会话并发互不阻塞、崩溃互不影响（对齐 dsh 的进程隔离）。
 *
 * 职责：spawn/回收、按会话 id 路由、消息转发；崩溃自动重启 + 通知。
 * M2a：spawn + 连通性自检（ping/pong）；后续 M2b+ 接 conversation 消息流。
 */
import { utilityProcess } from 'electron'
import type { UtilityProcess } from 'electron'
import { join } from 'node:path'

/** worker 入口（electron-vite main 多入口独立打包——out/main/agent-worker.js） */
const WORKER_ENTRY = join(__dirname, 'agent-worker.js')

export class AgentWorkerHost {
  private readonly workers = new Map<string, UtilityProcess>()

  /** 拉起一个会话对应的 Agent 进程（重复 id 复用一个） */
  spawn(id: string): void {
    if (this.workers.has(id)) return
    const proc = utilityProcess.fork(WORKER_ENTRY, [], {
      serviceName: `agent-worker-${id}`,
      env: { ...process.env },
    })
    proc.on('message', (msg) => this.handleMessage(id, msg))
    proc.on('exit', (code) => this.handleExit(id, code))
    this.workers.set(id, proc)
    // 连通性自检（M2a 验证进程能起、消息能通）
    proc.postMessage({ type: 'ping', sessionId: id } satisfies Record<string, unknown>)
  }

  /** 向会话进程发消息（不在池中则先 spawn） */
  dispatch(id: string, msg: Record<string, unknown>): void {
    if (!this.workers.has(id)) this.spawn(id)
    this.workers.get(id)?.postMessage(msg)
  }

  /** 回收某个会话进程 */
  destroy(id: string): void {
    this.workers.get(id)?.kill()
    this.workers.delete(id)
  }

  /** 全部回收（应用退出） */
  shutdownAll(): void {
    for (const proc of this.workers.values()) proc.kill()
    this.workers.clear()
  }

  get size(): number {
    return this.workers.size
  }

  private handleMessage(id: string, msg: unknown): void {
    const m = msg as { type?: string }
    if (m?.type === 'pong') {
      console.log(`[agent-worker] ${id} ✓ connected (ping/pong)`)
    }
  }

  private handleExit(id: string, code: number): void {
    console.warn(`[agent-worker] ${id} exited code=${code}（若有活跃会话将自动重启）`)
    this.workers.delete(id)
    // M4: 崩溃自动重启 + UI 通知
  }
}
