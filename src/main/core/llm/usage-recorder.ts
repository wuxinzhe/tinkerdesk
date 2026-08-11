/**
 * usage-recorder.ts — LLM usage 统计记录器（异步落库——不影响主链路）
 *
 * 架构：文件 append 缓冲（usage-pending.log）= 队列
 *   - 请求完成 → append 一行 JSON（<1ms——主链路只做追加，不碰 DB）
 *   - 定时器（5s）或行数满（50）→ 批量 INSERT（单事务）→ 截断文件
 *   - before-quit → 同步 flush（正常关闭不留尾巴）
 *   - 启动 → 残留 log 兜底入库（上次崩溃的恢复）
 *
 * 顺序保证：append 顺序 = 读取顺序（FIFO）——批量事务内顺序保持
 * 幂等：request_id UNIQUE + INSERT OR IGNORE——崩溃窗口（入库后截断前）重启兜底不会重复计数
 * 崩溃窗口：log 已落盘（页缓存）——最多丢最后几条（未 fsync 尾部——统计场景可接受）
 */
import { appendFileSync, existsSync, readFileSync, truncateSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getDatabase, withTransaction } from '../../repository/database'

/** 单条 usage 记录（写入 llm_usage_log 的字段拍平） */
export interface UsageRecord {
  /** 请求级唯一 id（幂等键——崩溃兜底重复入库时 INSERT OR IGNORE 跳过） */
  requestId: string
  profile?: string
  conversationId?: string
  sessionId?: string
  modelName: string
  scene: string
  status: 'success' | 'failed'
  promptTokens?: number
  completionTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  /** 请求总耗时（毫秒——caller 开始到结束） */
  latencyMs?: number
}

const FLUSH_INTERVAL_MS = 5_000
const FLUSH_BATCH_SIZE = 50

class UsageRecorder {
  private timer: NodeJS.Timeout | null = null
  private lineCount = 0

  private logPath(): string {
    return join(app.getPath('userData'), 'usage-pending.log')
  }

  /** 启动：残留兜底入库 + 启动定时器（bootstrap 调用一次） */
  init(): void {
    try {
      this.flushPending()
    } catch {
      // 启动兜底失败不阻塞应用——下轮定时器重试
    }
    this.timer = setInterval(() => this.flushPending(), FLUSH_INTERVAL_MS)
    // 定时器不阻止进程退出（统计非关键）
    this.timer.unref?.()
  }

  /** 请求完成 → 追加一行（主链路 <1ms——不碰 DB 不阻塞） */
  record(record: UsageRecord): void {
    try {
      appendFileSync(this.logPath(), JSON.stringify({ ...record, ts: Date.now() }) + '\n', 'utf8')
      this.lineCount++
      if (this.lineCount >= FLUSH_BATCH_SIZE) {
        this.flushPending()
      }
    } catch (e) {
      console.warn(`usage-recorder: append 失败（${(e as Error).message}）——本次统计丢弃`)
    }
  }

  /** 读 log → 批量 INSERT（单事务）→ 截断文件（同步——before-quit 可用） */
  flushPending(): void {
    const path = this.logPath()
    if (!existsSync(path)) return
    let content = ''
    try {
      content = readFileSync(path, 'utf8')
    } catch {
      return
    }
    const lines = content.split('\n').filter((l) => l.trim().length > 0)
    if (lines.length === 0) return
    try {
      const db = getDatabase()
      const insert = db.prepare(`INSERT OR IGNORE INTO llm_usage_log (
        request_id, profile, conversation_id, session_id, model_name, scene, status,
        prompt_tokens, completion_tokens, total_tokens, cache_read_tokens, cache_write_tokens, latency_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      withTransaction(() => {
        for (const line of lines) {
          try {
            const r = JSON.parse(line) as UsageRecord
            const prompt = r.promptTokens ?? 0
            const completion = r.completionTokens ?? 0
            insert.run(
              r.requestId,
              r.profile ?? 'default',
              r.conversationId ?? null,
              r.sessionId ?? null,
              r.modelName,
              r.scene,
              r.status,
              prompt,
              completion,
              prompt + completion,
              r.cacheReadTokens ?? 0,
              r.cacheWriteTokens ?? 0,
              r.latencyMs ?? 0
            )
          } catch {
            // 坏行跳过（不阻塞整批）
          }
        }
      })
      truncateSync(path)
      this.lineCount = 0
    } catch (e) {
      // 入库失败保留文件——下轮重试（数据不丢）
      console.warn(`usage-recorder: flush 失败（${(e as Error).message}）——保留缓冲下轮重试`)
    }
  }

  /** 正常关闭：停定时器 + 同步清空（before-quit 调用——不留尾巴） */
  shutdown(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    try {
      this.flushPending()
    } catch (e) {
      console.warn(`usage-recorder: 关闭 flush 失败（${(e as Error).message}）`)
    }
  }
}

/** 模块级单例（llm-router 埋点 + bootstrap 生命周期） */
export const usageRecorder = new UsageRecorder()
