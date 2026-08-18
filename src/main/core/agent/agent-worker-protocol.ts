/**
 * agent-worker-protocol.ts — AgentWorker（utilityProcess）↔ 主进程 host 的消息协议
 *
 * 主进程（AgentWorkerHost）与 worker（agent-worker-main）共用的消息类型。
 * worker 侧无 window/electron——所有"向前端推送"的动作都经此协议回主进程，
 * 由 host 转成 ElectronEventSender 事件投递到 UI（route 形态与主进程内联一致）。
 */

/** worker → main：UI 事件转发请求（对应 IEventSender 的一个方法调用） */
export interface WorkerUISenderEvent {
  /** 调用的发送器方法名（host 侧 switch 分发到 ElectronEventSender 对应方法） */
  method:
    | 'sendToken'
    | 'sendApprovalRequest'
    | 'sendMessage'
    | 'sendAction'
    | 'sendSession'
    | 'sendTips'
    | 'sendError'
  /** 目标会话 */
  sessionId: string
  /** 方法参数（与对应 IEventSender 方法签名一致；IPC 序列化后为 unknown） */
  args: unknown[]
}

/** worker → main 出站消息 */
export type WorkerOutboundMessage =
  | { type: 'ready' }
  | { type: 'pong'; sessionId?: string }
  | { type: 'agent:event'; payload: WorkerUISenderEvent }
  | { type: 'agent:done'; sessionId: string; conversationId?: string }
  | { type: 'agent:error'; sessionId: string; message: string }

/** main → worker 入站消息 */
export type WorkerInboundMessage =
  | { type: 'ping'; sessionId?: string }
  | { type: 'agent:prompt'; sessionId: string; profile: string; text: string }
