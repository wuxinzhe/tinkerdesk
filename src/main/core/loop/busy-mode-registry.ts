/**
 * busy-mode-registry.ts — 忙碌时消息处置策略注册表（queue/redirect/interrupt 单例）
 */
import { BUSY_MODE_QUEUE, BUSY_MODE_REDIRECT, BUSY_MODE_INTERRUPT } from './types'
import type { BusyMode, BusyModeStrategy } from './types'
import { QueueStrategy } from './strategies/queue-strategy'
import { RedirectStrategy } from './strategies/redirect-strategy'
import { InterruptStrategy } from './strategies/interrupt-strategy'

const queueStrategy = new QueueStrategy()
const redirectStrategy = new RedirectStrategy()
const interruptStrategy = new InterruptStrategy()

/** 策略注册表：按模式取单例（未知模式兜底 queue——向前兼容） */
export const BusyModeRegistry = {
  get(mode: BusyMode | string | undefined): BusyModeStrategy {
    switch (mode) {
      case BUSY_MODE_REDIRECT:
        return redirectStrategy
      case BUSY_MODE_INTERRUPT:
        return interruptStrategy
      case BUSY_MODE_QUEUE:
      default:
        return queueStrategy
    }
  },
}
