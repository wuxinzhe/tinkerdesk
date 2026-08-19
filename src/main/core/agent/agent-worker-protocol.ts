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
  | { type: 'agent:done'; sessionId: string; conversationId?: string; finishReason?: string }
  | { type: 'agent:error'; sessionId: string; message: string }

/**
 * main → worker 入站消息。
 * 默认对话路径（agent:chat → host.dispatch）：所有会话操作都经以下消息转发到 worker 进程，
 * 由 worker 内 AgentLoop 对应的 TinkerAgent 实例（waitToolResult / ApprovalManager /
 * SessionRuntime）处理挂起与恢复。
 */
export type WorkerInboundMessage =
  | { type: 'ping'; sessionId?: string }
  | { type: 'agent:prompt'; sessionId: string; profile: string; text: string }
  | { type: 'agent:toolResult'; sessionId: string; toolCallId: string; result: string }
  | { type: 'agent:approval'; sessionId: string; toolCallId: string; approved: boolean }
  | { type: 'agent:autoApprove'; conversationId: string }
  | { type: 'agent:revoke'; sessionId: string; messageId: string }
  | { type: 'agent:interrupt'; sessionId: string }
  | { type: 'agent:interruptNoPending'; sessionId: string }
  | { type: 'agent:clearAll'; sessionId: string }
