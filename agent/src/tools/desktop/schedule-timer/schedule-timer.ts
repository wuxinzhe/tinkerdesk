/**
 * schedule-timer.ts — 客户端工具
 * 内存定时器管理（setTimeout 封装）
 */
import { BaseTool, type ToolResult, type ToolSchema } from '../index'

import type { ScheduleTimerParams } from '@/defines/tools/params'
import type { TimerRecord } from '@/defines/tools/schedule-timer-types'

const timers = new Map<string, TimerRecord>()
let idCounter = 0

export class ScheduleTimerTool extends BaseTool<ScheduleTimerParams> {
  readonly id = 'desktop_showing_schedule_timer'
  readonly name = '定时器'
  readonly description = '创建、取消、列出内存中的定时器'
  readonly category = 'utility'

  getSchema(): ToolSchema {
    return {
      type: 'function',
      function: {
        name: 'desktop_showing_schedule_timer',
        description: '创建、取消、列出内存中的定时器',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: '操作类型',
              enum: ['start', 'cancel', 'list']
            },
            name: {
              type: 'string',
              description: '定时器名称'
            },
            duration: {
              type: 'integer',
              description: '定时时长（毫秒）'
            },
            timerId: {
              type: 'string',
              description: '要取消的定时器 ID'
            }
          },
          required: ['action']
        }
      },
      toolType: 'desktop',
      emoji: '⏰'
    }
  }

  async checkAvailability(): Promise<{ available: boolean }> {
    return { available: true }
  }

  async execute(params: ScheduleTimerParams): Promise<ToolResult> {
    switch (params.action) {
      case 'start': {
        if (!params.duration || params.duration <= 0) return { ok: false, error: 'duration 必须为正数（毫秒）' }
        const id = `timer_${Date.now()}_${++idCounter}`
        const startTime = Date.now()
        const timeout = setTimeout(() => {
          const record = timers.get(id)
          if (record) { record.elapsed = true; record.remaining = 0 }
        }, params.duration)
        if (timeout.unref) timeout.unref()
        timers.set(id, { id, name: params.name || id, duration: params.duration, startTime, timeout, remaining: params.duration, elapsed: false })
        return { ok: true, data: { timerId: id } }
      }
      case 'cancel': {
        const id = params.timerId || params.name
        if (!id) return { ok: false, error: '需要 timerId 或 name' }
        const timer = timers.get(id) || Array.from(timers.values()).find(t => t.name === id)
        if (!timer) return { ok: false, error: `未找到定时器: "${id}"` }
        clearTimeout(timer.timeout); timers.delete(timer.id)
        return { ok: true }
      }
      case 'list': {
        const now = Date.now()
        return {
          ok: true, data: {
            timers: Array.from(timers.values()).map(t => ({
              id: t.id, name: t.name, duration: t.duration,
              remaining: t.elapsed ? 0 : Math.max(0, t.duration - (now - t.startTime)),
              elapsed: t.elapsed
            }))
          }
        }
      }
      default: return { ok: false, error: `未知操作: "${params.action}"` }
    }
  }
}

export const scheduleTimerTool = new ScheduleTimerTool()
