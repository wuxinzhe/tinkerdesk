/**
 * busy-mode-registry.ts — 忙碌时消息处置策略注册表（queue/redirect/interrupt 单例）
 */
import type { BusyMode } from '../loop/types'
import type { BusyModeStrategy } from './busy-mode'
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
      case 'redirect':
        return redirectStrategy
      case 'interrupt':
        return interruptStrategy
      case 'queue':
      default:
        return queueStrategy
    }
  },
}
