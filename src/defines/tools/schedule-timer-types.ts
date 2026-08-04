/**
 * schedule-timer-types.ts — schedule-timer 工具类型定义（从 tools/desktop/schedule-timer/ 转移）
 */

/** 定时器记录 */
export interface TimerRecord {
  id: string
  name: string
  duration: number
  startTime: number
  timeout: NodeJS.Timeout
  remaining: number
  elapsed: boolean
}
