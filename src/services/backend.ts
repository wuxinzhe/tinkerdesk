/**
 * backend.ts — 后端 WebSocket 连接单例
 *
 * 替代 renderer/composables/use-backend-composable.ts，纯模块单例。
 */
import { createBackend } from '@/api/backend'
import type { Backend } from '@/api/backend'

let _backend: Backend | null = null

export async function initBackend(): Promise<Backend> {
  if (!_backend) {
    // 检查 window 上是否残留旧后端（HMR 模块重载后 _backend 丢失但旧 WebSocket 仍存活）
    const oldBackend = (window as any).__backend__
    if (oldBackend) {
      try { await oldBackend.disconnect() } catch { /* 忽略 */ }
      delete (window as any).__backend__
    }
    _backend = await createBackend()
    ;(window as any).__backend__ = _backend
  }
  return _backend
}

/** 重建 Backend：断开旧连接并创建新实例，防止 HMR 模块重载后旧 WebSocket 泄漏。 */
export async function rebuildBackend(): Promise<Backend> {
  if (_backend) {
    try { await _backend.disconnect() } catch { /* 忽略断开异常 */ }
  }
  _backend = await createBackend()
  return _backend
}

export function getBackend(): Backend {
  if (!_backend) {
    throw new Error('Backend 尚未初始化，请先调用 initBackend()')
  }
  return _backend
}
