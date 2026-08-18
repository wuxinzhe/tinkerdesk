/**
 * agent-worker-host.ts — Agent 进程宿主（主进程侧）
 *
 * 每个活跃会话对应一个隔离 AgentWorker 进程（utilityProcess）——进程级隔离：
 * 多 profile/会话并发互不阻塞、崩溃互不影响（对齐 dsh 的进程隔离）。
 *
 * 职责：spawn/回收、按会话 id 路由、消息转发；崩溃自动重启 + 通知。
 * - M2a：spawn + 连通性自检（ping/pong）
 * - M2b+：把 worker 发回的 `agent:event`（worker 侧 IEventSender 消息）统一经
 *   ElectronEventSender 转发到 UI——route 形态与主进程内联路径完全一致；
 *   `agent:done`/`agent:error` 记录日志。
 */
import { app, utilityProcess } from 'electron'
import type { UtilityProcess } from 'electron'
import { join } from 'node:path'
import { ElectronEventSender } from '../../service/event-sender-service'
import type { WorkerOutboundMessage, WorkerUISenderEvent } from './agent-worker-protocol'

/** worker 入口（electron-vite main 多入口独立打包——out/main/agent-worker.js） */
const WORKER_ENTRY = join(__dirname, 'agent-worker.js')

export class AgentWorkerHost {
  private readonly workers = new Map<string, UtilityProcess>()
  /** 会话 → 目标 renderer（webContents）id——agent-worker:send 触发时登记，worker 事件据此回投 */
  private readonly relays = new Map<string, number>()
  /** 会话 → 复用的 ElectronEventSender（保留 token 攒批等发送器状态） */
  private readonly senders = new Map<string, ElectronEventSender>()

  /** 拉起一个会话对应的 Agent 进程（重复 id 复用一个） */
  spawn(id: string): void {
    if (this.workers.has(id)) return
    const proc = utilityProcess.fork(WORKER_ENTRY, [], {
      serviceName: `agent-worker-${id}`,
      env: {
        ...process.env,
        // worker（utilityProcess）无 electron app 对象——注入 userData 目录供其 initDatabase/装配使用
        TINKERDESK_USER_DATA: app.getPath('userData'),
      },
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

  /** 登记某会话的 worker 事件回流到某个 renderer（webContents id——由触发 IPC 的 event.sender 提供） */
  setRelay(sessionId: string, senderId: number): void {
    this.relays.set(sessionId, senderId)
  }

  /** 回收某个会话进程 */
  destroy(id: string): void {
    this.workers.get(id)?.kill()
    this.workers.delete(id)
    this.relays.delete(id)
    this.senders.delete(id)
  }

  /** 全部回收（应用退出） */
  shutdownAll(): void {
    for (const proc of this.workers.values()) proc.kill()
    this.workers.clear()
    this.relays.clear()
    this.senders.clear()
  }

  get size(): number {
    return this.workers.size
  }

  /** 取某会话的 UI 转发发送器（未登记回流目标 → null，事件丢弃） */
  private getSender(sessionId: string): ElectronEventSender | null {
    const senderId = this.relays.get(sessionId)
    if (senderId === undefined) return null
    let sender = this.senders.get(sessionId)
    if (!sender) {
      sender = new ElectronEventSender(senderId, sessionId)
      this.senders.set(sessionId, sender)
    }
    return sender
  }

  /** worker 的 IEventSender 事件 → ElectronEventSender 对应方法 → UI（IPC_MESSAGE 单通道） */
  private relayToUi(evt: WorkerUISenderEvent): void {
    const sender = this.getSender(evt.sessionId)
    if (!sender) return
    const { sessionId } = evt
    const args = evt.args
    switch (evt.method) {
      case 'sendToken':
        sender.sendToken(sessionId, args[0] as Parameters<typeof sender.sendToken>[1])
        break
      case 'sendApprovalRequest':
        sender.sendApprovalRequest(sessionId, args[0] as Parameters<typeof sender.sendApprovalRequest>[1])
        break
      case 'sendMessage':
        sender.sendMessage(sessionId, args[0] as string, args[1])
        break
      case 'sendAction':
        sender.sendAction(sessionId, args[0] as string, args[1])
        break
      case 'sendSession':
        sender.sendSession(sessionId, args[0] as string, args[1], args[2] as string | undefined)
        break
      case 'sendTips':
        sender.sendTips(sessionId, args[0] as string, args[1] as string)
        break
      case 'sendError':
        sender.sendError(sessionId, args[0] as string, args[1] as string)
        break
      default:
        break
    }
  }

  private handleMessage(_id: string, msg: unknown): void {
    const m = msg as WorkerOutboundMessage
    switch (m?.type) {
      case 'pong':
        console.log(`[agent-worker] ${_id} ✓ connected (ping/pong)`)
        break
      case 'agent:event':
        this.relayToUi(m.payload)
        break
      case 'agent:done':
        console.log(`[agent-worker] ${_id} ✓ agent:done conv=${m.conversationId ?? '-'}`)
        break
      case 'agent:error':
        console.error(`[agent-worker] ${_id} ✗ agent:error sessionId=${m.sessionId} msg=${m.message}`)
        break
      default:
        break
    }
  }

  private handleExit(id: string, code: number): void {
    console.warn(`[agent-worker] ${id} exited code=${code}（若有活跃会话将自动重启）`)
    this.workers.delete(id)
    this.relays.delete(id)
    this.senders.delete(id)
    // M4: 崩溃自动重启 + UI 通知
  }
}
