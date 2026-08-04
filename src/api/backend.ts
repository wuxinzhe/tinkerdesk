/**
 * backend.ts — 后端通信多态实现
 *
 * 提供 Backend 接口的 Electron 桌面端实现（ElectronBackend）及工厂函数。
 * 类型定义已剥离到 backend-types.ts，避免与 ws-client.ts 的循环引用。
 */
import { WebSocketClient } from './ws-client'
import type { ToolDefinition } from '@/defines/tools/base-tool'
import type { Backend, ElectronApi, PlatformCapabilities, BackendEvent, DesktopToolDef } from '@/defines/api/backend-types'

// Re-export 类型，保持已有 import { Backend } from '@/api/backend' 兼容
export type { Backend, BackendEvent, PlatformCapabilities, DesktopToolDef, ElectronApi }

// ── Electron 平台常量 ──

const desktopCapabilities: PlatformCapabilities = {
  platformName: 'desktop',
  nativeFileDialog: true,
  hasTerminal: true,
  hasFileRead: true
}

/**
 * Electron 桌面端 Backend — 包装 WebSocketClient 用于服务器通信，
 * 额外覆盖 executeTool 走 IPC 调用本地工具。
 */
class ElectronBackend implements Backend {
  private ws: WebSocketClient

  constructor(private readonly api: ElectronApi) {
    this.ws = new WebSocketClient()
  }

  async connect(url: string): Promise<void> {
    return this.ws.connect(url)
  }

  async disconnect(): Promise<void> {
    await this.ws.disconnect()
  }

  send(msg: unknown): void {
    this.ws.send(msg)
  }

  onMessage(cb: (msg: unknown) => void): void {
    this.ws.onMessage(cb)
  }

  onEvent(cb: (event: BackendEvent) => void): void {
    this.ws.onEvent(cb)
  }

  registerTools(builtin: ToolDefinition[], extensions: ToolDefinition[]): void {
    this.ws.registerTools(builtin, extensions)
  }

  setOnReconnect(cb: () => void): void {
    this.ws.setOnReconnect(cb)
  }

  setOnReconnectFailed(cb: (error: string) => void): void {
    this.ws.setOnReconnectFailed(cb)
  }

  async executeTool(toolId: string, params: unknown): Promise<unknown> {
    return this.api.executeTool(toolId, params)
  }

  getCapabilities(): PlatformCapabilities {
    return desktopCapabilities
  }
}

// ── 工厂 ──

export function createBackend(): Backend {
  if (window.api) {
    return new ElectronBackend(window.api)
  }
  return new WebSocketClient()
}
