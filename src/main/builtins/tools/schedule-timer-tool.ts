/**
 * desktop/schedule-timer-tool.ts — 定时器工具
 *
 * Schedule-timer tool: in-memory timer management (setTimeout wrapper): start / cancel / list
 * 内存定时器管理（setTimeout 封装）：start / cancel / list
 */
import { BaseTool } from './base-tool'
import { ToolResult } from '../../core/tool/tool-result'
import type { PromptRenderer } from '../../core/prompt/renderer'
import type { ToolContext } from '../../core/loop/types'
import type { ScheduleTimerParams, TimerRecord } from './types'

/** 工具名 */
export const TOOL_NAME = 'desktop_tinker_schedule_timer'

const timers = new Map<string, TimerRecord>()
let idCounter = 0

/** 定时器工具 */
export class ScheduleTimerTool extends BaseTool {
  constructor(renderer: PromptRenderer) {
    super(renderer, TOOL_NAME)
  }

  check(): boolean {
    return true
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const params = (ctx.toolCall.arguments ?? {}) as unknown as ScheduleTimerParams
    switch (params.action) {
      case 'start': {
        if (!params.duration || params.duration <= 0) return ToolResult.sync(JSON.stringify({ error: 'duration 必须为正数（毫秒）' }))
        const id = `timer_${Date.now()}_${++idCounter}`
        const startTime = Date.now()
        const timeout = setTimeout(() => {
          const record = timers.get(id)
          if (record) { record.elapsed = true; record.remaining = 0 }
        }, params.duration)
        if (timeout.unref) timeout.unref()
        timers.set(id, { id, name: params.name || id, duration: params.duration, startTime, timeout, remaining: params.duration, elapsed: false })
        return ToolResult.sync(JSON.stringify({ timerId: id }))
      }
      case 'cancel': {
        const id = params.timerId || params.name
        if (!id) return ToolResult.sync(JSON.stringify({ error: '需要 timerId 或 name' }))
        const timer = timers.get(id) || Array.from(timers.values()).find(t => t.name === id)
        if (!timer) return ToolResult.sync(JSON.stringify({ error: `未找到定时器: "${id}"` }))
        clearTimeout(timer.timeout); timers.delete(timer.id)
        return ToolResult.sync(JSON.stringify({ ok: true }))
      }
      case 'list': {
        const now = Date.now()
        return ToolResult.sync(JSON.stringify({
          timers: Array.from(timers.values()).map(t => ({
            id: t.id, name: t.name, duration: t.duration,
            remaining: t.elapsed ? 0 : Math.max(0, t.duration - (now - t.startTime)),
            elapsed: t.elapsed
          }))
        }))
      }
      default: return ToolResult.sync(JSON.stringify({ error: `未知操作: "${params.action}"` }))
    }
  }
}
