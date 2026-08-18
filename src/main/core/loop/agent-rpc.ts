/**
 * agent-rpc.ts — Conversation 与宿主（主进程 / worker 进程）之间的跨进程外呼契约
 *
 * Conversation 不再直接依赖宿主全局单例（eventRecorder 等），改经 AgentRpc 外呼：
 * - 主进程内联：AgentRpcInline —— 直接调 eventRecorder（行为零变，回归基准）
 * - 进程隔离：AgentRpcIPC —— 经 MessagePort postMessage 到主进程执行
 *
 * 接口随 M1 逐点扩展：推送(stream/action/tip/error)、持久化 flush、审批、中断控制。
 * 每类外呼增量接入 conversation → 主进程内联实现兜底 → 编译回归通过 → 再补 worker 侧。
 */
import type { AgentEvent } from '../../service/event-recorder'
import { eventRecorder } from '../../service/event-recorder'

export interface AgentRpc {
  /** 事件表埋点（异步批量写——不阻塞主流程，失败兜底）。返回 void：调用方不等待落库。 */
  recordEvent(evt: AgentEvent): void
}

/** 主进程内联实现——直接调主进程全局单例（当前为唯一实现，作为行为零变基准） */
export class AgentRpcInline implements AgentRpc {
  recordEvent(evt: AgentEvent): void {
    eventRecorder.record(evt)
  }
}
