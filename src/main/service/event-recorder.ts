/**
 * event-recorder.ts — 事件埋点记录器（异步队列——不阻塞主链路）
 *
 * Architecture (async-persistence pattern):
 *   - record() only enqueues (<1ms) — the main path never touches DB
 *   - timer (200ms) or queue full (50 entries) → batch INSERT (single transaction) → strict order
 *   - 失败不抛（日志兜底）——事件丢了不影响功能
 *
 * 配置（app_settings 键值）：
 *   agentEvents.enabled = 'true'   （默认开——总是有证据）
 *   agentEvents.maxRows = '50000'  （环形上限——超了删最旧）
 *
 * 事件类型（event_type + event_name 二维）：
 *   conversation: turn_start / turn_end / redirect / abort / flush
 *   llm:          request / response / retry / fallback / error
 *   stream:       token_batch / finish
 *   tool:         call / result / approval / error
 *   message:      saved
 *   interaction:  clarify / voice_stt / voice_barge
 */
import { getDatabase } from '../repository/database'
import { getAppSettings } from './general-settings-service'

export type EventType =
  | 'conversation'
  | 'llm'
  | 'stream'
  | 'tool'
  | 'message'
  | 'interaction'
  | 'error'

export interface AgentEvent {
  sessionId: string
  conversationId?: string
  eventType: EventType
  eventName: string
  payload?: Record<string, unknown>
  latencyMs?: number
}

const FLUSH_INTERVAL_MS = 200
const FLUSH_BATCH_SIZE = 50
const DEFAULT_MAX_ROWS = 50_000

/** 每会话 seq 缓存（事件顺序——会话内递增） */
const sessionSeq = new Map<string, number>()

class EventRecorder {
  private queue: AgentEvent[] = []
  private timer: ReturnType<typeof setInterval> | null = null

  /** 是否启用（读 app_settings——默认开） */
  private enabled(): boolean {
    try {
      return getAppSettings().settings['agentEvents.enabled'] !== 'false'
    } catch {
      return true
    }
  }

  /** 环形上限（读 app_settings——默认 50000） */
  private maxRows(): number {
    try {
      const v = Number(getAppSettings().settings['agentEvents.maxRows'])
      return Number.isFinite(v) && v > 0 ? v : DEFAULT_MAX_ROWS
    } catch {
      return DEFAULT_MAX_ROWS
    }
  }

  /** 记录事件（入队——不阻塞） */
  record(evt: AgentEvent): void {
    if (!this.enabled()) return
    this.queue.push(evt)
    if (this.queue.length >= FLUSH_BATCH_SIZE) {
      this.flush()
      return
    }
    if (!this.timer) {
      this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS)
      this.timer.unref?.()
    }
  }

  /** 同步落库全部剩余事件（正常退出前调用——不丢队列——dispose drain） */
  flushSync(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.queue.length === 0) return
    const batch = this.queue
    this.queue = []
    try {
      const db = getDatabase()
      const stmt = db.prepare(
        `INSERT INTO agent_events (session_id, conversation_id, seq, event_type, event_name, payload, latency_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      db.exec('BEGIN')
      try {
        for (const evt of batch) {
          const seq = sessionSeq.get(evt.sessionId) ?? 0
          sessionSeq.set(evt.sessionId, seq + 1)
          stmt.run(
            evt.sessionId,
            evt.conversationId ?? '',
            seq,
            evt.eventType,
            evt.eventName,
            JSON.stringify(evt.payload ?? {}),
            evt.latencyMs ?? 0,
          )
        }
        db.exec('COMMIT')
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    } catch (e) {
      console.warn(`[event-recorder] 退出落库失败（${(e as Error).message}）——丢弃 ${batch.length} 条`)
    }
  }

  /** 批量落库（单事务——严格顺序） */
  private flush(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.queue.length === 0) return
    const batch = this.queue
    this.queue = []
    try {
      const db = getDatabase()
      const stmt = db.prepare(
        `INSERT INTO agent_events (session_id, conversation_id, seq, event_type, event_name, payload, latency_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      db.exec('BEGIN')
      try {
        for (const evt of batch) {
          const seq = sessionSeq.get(evt.sessionId) ?? 0
          sessionSeq.set(evt.sessionId, seq + 1)
          stmt.run(
            evt.sessionId,
            evt.conversationId ?? '',
            seq,
            evt.eventType,
            evt.eventName,
            JSON.stringify(evt.payload ?? {}),
            evt.latencyMs ?? 0,
          )
        }
        db.exec('COMMIT')
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
      this.pruneIfNeeded()
    } catch (e) {
      console.warn(`[event-recorder] 落库失败（${(e as Error).message}）——丢弃 ${batch.length} 条`)
    }
  }

  /** 环形清理：超过 maxRows 删最旧 */
  private pruneIfNeeded(): void {
    try {
      const db = getDatabase()
      const row = db.prepare('SELECT COUNT(*) AS c FROM agent_events').get() as { c: number }
      const max = this.maxRows()
      if (row.c > max) {
        const excess = row.c - max
        db.prepare('DELETE FROM agent_events WHERE id IN (SELECT id FROM agent_events ORDER BY id LIMIT ?)').run(excess)
      }
    } catch {
      // 清理失败不阻塞
    }
  }

  /** 当前事件条数（设置页容量显示） */
  countAll(): number {
    try {
      const db = getDatabase()
      const row = db.prepare('SELECT COUNT(*) AS c FROM agent_events').get() as { c: number }
      return row.c
    } catch {
      return 0
    }
  }

  /** 清空全部事件（设置页一键清理——保留表结构） */
  clearAll(): void {
    try {
      const db = getDatabase()
      db.prepare('DELETE FROM agent_events').run()
    } catch (e) {
      console.warn(`[event-recorder] 清空失败（${(e as Error).message}）`)
    }
  }
}

/** 全局单例 */
export const eventRecorder = new EventRecorder()
