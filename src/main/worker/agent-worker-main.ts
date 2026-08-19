/**
 * agent-worker-main.ts — Agent 进程入口（utilityProcess——独立 Node 进程，进程级隔离）
 *
 * 生命周期：主进程 AgentWorkerHost.spawn() 拉起本进程，经 process.parentPort 双向消息：
 * - 启动即向主进程回 `ready`
 * - 收 `ping` 回 `pong`（连通性自检）
 * - 收 `agent:prompt { sessionId, profile, text }` → 驱动一整个 AgentLoop：
 *     initDatabase → assembleAgentLoop → SessionContextFactory.build（sender=IPC 发送器）
 *     → new TinkerAgent(...).chat(ctx, text) → 完成后回 `agent:done`（失败回 `agent:error`）
 *
 * worker 内无 window/renderer——纯 Node 上下文。所有向前端推送的事件由 IPC 发送器
 * （WorkerEventSender，实现 IEventSender）postMessage 回主进程，host 负责转发到 UI。
 *
 * 注意：worker 无 electron `app` 对象——userDataPath 由主进程 spawn 时经
 * TINKERDESK_USER_DATA 环境变量注入；assembleAgentLoop 内各 electron 依赖点
 * 已通过 utils/electron-app 守卫（回落该环境变量）。
 */
import { initDatabase } from '../repository/database'
import { assembleAgentLoop, type AgentLoopAssembly } from '../core/agent/assemble-agent-loop'
import { TinkerAgent } from '../core/loop/tinker-agent'
import type { LlmChunk } from '../core/llm/types'
import type { IEventSender } from '../core/loop/types'
import type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
  WorkerUISenderEvent,
} from '../core/agent/agent-worker-protocol'

const port = process.parentPort
if (!port) {
  throw new Error('agent-worker-main 必须运行在 utilityProcess 中（process.parentPort 不存在）')
}

/** 出站消息统一出口 */
function send(msg: WorkerOutboundMessage): void {
  port.postMessage(msg)
}

/**
 * IPC 发送器：worker 侧 IEventSender 实现。
 * 每个方法调用 → postMessage 一个 `agent:event`（method + args）回主进程，
 * 由 host 分发到 ElectronEventSender 的对应方法，最终以主进程内联相同的前端事件形态投递到 UI。
 */
class WorkerEventSender implements IEventSender {
  constructor(private readonly sessionId: string) {}

  private emit(method: WorkerUISenderEvent['method'], sessionId: string, ...args: unknown[]): void {
    send({ type: 'agent:event', payload: { method, sessionId, args } })
  }

  sendMessage(sessionId: string, type: string, data: unknown): void {
    this.emit('sendMessage', sessionId, type, data)
  }
  sendAction(sessionId: string, type: string, data: unknown): void {
    this.emit('sendAction', sessionId, type, data)
  }
  sendSession(sessionId: string, type: string, data: unknown, convId?: string): void {
    this.emit('sendSession', sessionId, type, data, convId)
  }
  sendTips(sessionId: string, type: string, message: string): void {
    this.emit('sendTips', sessionId, type, message)
  }
  sendError(sessionId: string, type: string, message: string): void {
    this.emit('sendError', sessionId, type, message)
  }
  sendToken(sessionId: string, chunk: LlmChunk): void {
    this.emit('sendToken', sessionId, chunk)
  }
  sendApprovalRequest(
    sessionId: string,
    data: { toolCallId: string; name: string; arguments?: unknown; reason?: string; conversationId?: string }
  ): void {
    this.emit('sendApprovalRequest', sessionId, data)
  }
}

/** 装配结果（懒加载——首次 prompt 时装配一次，重复利用整套业务层） */
let assembly: AgentLoopAssembly | null = null

/** 每个会话一个 TinkerAgent 实例（跨轮保持队列/中断等会话状态） */
const agents = new Map<string, TinkerAgent>()

/** 装配 Agent 运行时（initDatabase + assembleAgentLoop——复用主进程同一套装配代码） */
function getAssembly(): AgentLoopAssembly {
  if (assembly) return assembly
  const userDataPath = process.env.TINKERDESK_USER_DATA ?? ''
  initDatabase(userDataPath)
  assembly = assembleAgentLoop({
    userDataPath,
    promptModules: [],
    toolRegistrations: [],
  })
  return assembly
}

/** 处理一轮对话（agent:prompt）——驱动真实 AgentLoop 并把流式事件经 IPC 发回主进程 */
async function handlePrompt(msg: { sessionId: string; profile: string; text: string }): Promise<void> {
  const { sessionId, profile, text } = msg
  try {
    const asm = getAssembly()
    // 建 SessionContext：sender 用 IPC 发送器——会话内一切流式/工具/审批事件都回主进程
    const ctx = asm.sessionContextFactory.build({
      sessionId,
      profile,
      sender: new WorkerEventSender(sessionId),
    })
    let agent = agents.get(sessionId)
    if (!agent) {
      agent = new TinkerAgent({ ...asm.agentLoopOptions, sessionId, profile })
      agents.set(sessionId, agent)
    }
    const result = await agent.chat(ctx, text)
    send({ type: 'agent:done', sessionId, conversationId: result.conversationId, finishReason: result.response.finishReason })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    console.error(`[agent-worker] prompt 失败 sessionId=${sessionId} err=${err.message}\n${err.stack ?? ''}`)
    send({ type: 'agent:error', sessionId, message: err.message + '\n' + (err.stack ?? '') })
  }
}

/** 取某会话的 Agent 实例（会话必经 agent:prompt 创建；仅操作类消息到达时可能没有实例——安全 no-op） */
function agentFor(sessionId: string): TinkerAgent | undefined {
  return agents.get(sessionId)
}

port.on('message', (e: { data?: WorkerInboundMessage }) => {
  const msg = (e as { data?: WorkerInboundMessage }).data
  if (!msg) return
  switch (msg.type) {
    case 'ping':
      send({ type: 'pong', sessionId: msg.sessionId })
      break
    case 'agent:prompt':
      void handlePrompt(msg)
      break
    // ── 默认对话路径的会话操作：host 转发到本进程，由 worker 内 AgentLoop 的
    //    TinkerAgent 实例（waitToolResult / ApprovalManager / SessionRuntime）挂起与恢复 ──
    case 'agent:toolResult': {
      agentFor(msg.sessionId)?.onToolResult(msg.sessionId, msg.toolCallId, msg.result)
      break
    }
    case 'agent:approval': {
      agentFor(msg.sessionId)?.onApproval(msg.sessionId, msg.toolCallId, msg.approved)
      break
    }
    case 'agent:autoApprove': {
      // 本进程一个会话一个 Agent —— 遍历所有实例放行对应 conversationId 的审批
      for (const a of agents.values()) a.setAutoApprove(msg.conversationId)
      break
    }
    case 'agent:revoke': {
      agentFor(msg.sessionId)?.revoke(msg.sessionId, msg.messageId)
      break
    }
    case 'agent:interrupt': {
      agentFor(msg.sessionId)?.interrupt(msg.sessionId)
      break
    }
    case 'agent:interruptNoPending': {
      agentFor(msg.sessionId)?.interruptNoPending(msg.sessionId)
      break
    }
    case 'agent:clearAll': {
      const a = agentFor(msg.sessionId)
      if (a) {
        a.clearAll(msg.sessionId)
        a.dispose()
      }
      agents.delete(msg.sessionId)
      break
    }
    case 'agent:recover': {
      // 崩溃自动重启后主进程发来恢复消息——确保 DB + AgentLoop 运行时装配就绪（fresh 进程懒装配一次）
      try {
        getAssembly()
        console.log(`[agent-worker] session=${msg.sessionId} 恢复成功（装配就绪）`)
        send({ type: 'pong', sessionId: msg.sessionId })
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        console.error(`[agent-worker] session=${msg.sessionId} 恢复失败: ${err.message}\n${err.stack ?? ''}`)
        send({ type: 'agent:error', sessionId: msg.sessionId, message: `恢复失败: ${err.message}` })
      }
      break
    }
    default: {
      // 未知类型——回 agent:error 便于主进程观测
      const raw = msg as { type?: string; sessionId?: string }
      send({ type: 'agent:error', sessionId: raw.sessionId ?? '', message: `unknown 消息类型: ${raw.type ?? '?'}` })
    }
  }
})

// 启动就绪信号
send({ type: 'ready' })
