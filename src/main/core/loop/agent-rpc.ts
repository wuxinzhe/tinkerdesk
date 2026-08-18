/**
 * agent-rpc.ts — Conversation 与宿主（主进程 / worker 进程）之间的跨进程外呼契约
 *
 * Conversation 不再直接依赖宿主全局单例 / 主进程独占资源（eventRecorder、DB 事务），
 * 改经 AgentRpc 外呼：
 * - 主进程内联：AgentRpcInline —— 直接调 eventRecorder / withTransaction 落库（行为零变，回归基准）
 * - 进程隔离：AgentRpcIPC —— 经 MessagePort postMessage 到主进程执行（后续 M2 引入）
 *
 * 接口随 M1 逐点扩展：推送(stream/action/tip/error)、持久化 flush、审批、中断控制。
 * 每类外呼增量接入 conversation → 主进程内联实现兜底 → 编译回归 → 再补 worker 侧。
 */
import type { CompactionService } from '../../service/compaction-service'
import type { ConversationService } from '../../service/conversation-service'
import type { MessageService } from '../../service/message-service'
import type { SessionService } from '../../service/session-service'
import { withTransaction } from '../../repository/database'
import { CONV_COMPLETED } from '../constants'
import type { AgentEvent } from '../../service/event-recorder'
import { eventRecorder } from '../../service/event-recorder'

/** 回合结束持久化参数（纯数据——可序列化跨进程） */
export interface FinishRoundParams {
  sessionId: string
  convId: string
  profile: string
  cacheReadTokens: number
  cacheWriteTokens: number
  promptTokens: number
  completionTokens: number
  durationMs: number
  iterationCount: number
  llmRequestCount: number
  accPrompt: number
  accCompletion: number
  accCacheRead: number
  accCacheWrite: number
}

export interface AgentRpc {
  /** 事件表埋点（异步批量写——不阻塞主流程，失败兜底）。返回 void：调用方不等待落库。 */
  recordEvent(evt: AgentEvent): void
  /**
   * 回合结束持久化（主进程原子事务：flush 暂存消息 + 对话完成 + 会话统计）。
   * 返回本轮上下文总量 roundContextTokens（最后一条 assistant 的 prompt_tokens）。
   * 内联=主进程执行；worker=postMessage 到主进程执行同一逻辑。
   */
  finishRound(p: FinishRoundParams): number
}

/** 主进程内联实现——直接调主进程全局单例 / DB 事务（当前为唯一实现，作为行为零变基准） */
export class AgentRpcInline implements AgentRpc {
  constructor(private readonly svc: {
    messageService: MessageService
    conversationService: ConversationService
    sessionService: SessionService
  }) {}

  recordEvent(evt: AgentEvent): void {
    eventRecorder.record(evt)
  }

  finishRound(p: FinishRoundParams): number {
    const { messageService, conversationService, sessionService } = this.svc
    return withTransaction(() => {
      // 暂存消息落库（先 flush——拿到本轮上下文总量）
      const roundContextTokens = messageService.flushConversation(p.convId)
      // 对话完成（usage 更新 conversation）
      conversationService.updateStatus(p.convId, p.sessionId, CONV_COMPLETED, {
        cacheReadTokens: p.cacheReadTokens,
        cacheWriteTokens: p.cacheWriteTokens,
        totalTokens: p.promptTokens + p.completionTokens,
        durationMs: p.durationMs,
        iterationCount: p.iterationCount,
        llmRequestCount: p.llmRequestCount,
        roundContextTokens,
        completedAt: new Date().toISOString(),
      })
      // 会话 token 统计（本轮 AgentLoop 全部响应累计）
      if (p.accPrompt > 0 || p.accCompletion > 0) {
        sessionService.accumulateTokens(
          p.sessionId,
          p.profile,
          p.accPrompt,
          p.accCompletion,
          p.accCacheRead,
          p.accCacheWrite,
          p.durationMs,
          p.iterationCount,
          p.llmRequestCount,
          roundContextTokens
        )
      }
      return roundContextTokens
    })
  }
}
