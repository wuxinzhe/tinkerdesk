/**
 * backend-types.ts — 后端通信抽象契约
 *
 * 纯类型定义，无运行时依赖，用于解耦 backend.ts 和 ws-client.ts 之间的循环引用。
 * 所有 Backend 的实现方（WebSocketClient、ElectronBackend）和调用方都从此文件 import 类型。
 */
import type { ToolDefinition } from '@/defines/tools/base-tool'

// ── 事件类型 ──

export type BackendEvent =
  | { type: 'message'; data: unknown }
  | { type: 'error'; error: string }
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'reconnecting'; attempt: number; delay: number }
  | { type: 'reconnect_failed'; error: string }
  | { type: 'heartbeat_timeout' }

// ── 平台能力 ──

export interface PlatformCapabilities {
  platformName: 'desktop' | 'web'
  nativeFileDialog: boolean
  hasTerminal: boolean
  hasFileRead: boolean
}

// ── Backend 抽象接口 ──

export interface Backend {
  /** 建立连接 */
  connect(url: string): Promise<void>
  /** 断开连接 */
  disconnect(): void | Promise<void>

  /** 发送消息到后端 */
  send(msg: unknown): void
  /** 监听后端消息 */
  onMessage(cb: (msg: unknown) => void): void
  /** 监听后端生命周期事件（连接成功/断开/重连中） */
  onEvent(cb: (event: BackendEvent) => void): void

  /** 注册本端可用工具（拆分 builtin + extensions） */
  registerTools(builtin: ToolDefinition[], extensions: ToolDefinition[]): void
  /** 设置重连回调 */
  setOnReconnect?(cb: () => void): void
  /** 设置重连失败回调 */
  setOnReconnectFailed?(cb: (error: string) => void): void
  /** 执行工具 */
  executeTool(toolId: string, params: unknown): Promise<unknown>

  /** 获取平台能力 */
  getCapabilities(): PlatformCapabilities
}

// ── Electron 平台类型 ──

export interface DesktopToolDef {
  id: string; name: string; description: string; source: 'desktop' | 'plugin'; category: string
  schema?: {
    type: 'function'
    function: {
      name: string
      description: string
      parameters: {
        type: 'object'
        properties: Record<string, unknown>
        required: string[]
      }
    }
  }
}

export interface ElectronApi {
  detectTools(): Promise<{ tools: DesktopToolDef[]; unavailable: Array<{ id: string; reason: string }> }>
  executeTool(id: string, params: unknown): Promise<unknown>
  checkForUpdates(manual?: boolean): Promise<unknown>
  installUpdate(): Promise<unknown>
  getAppVersion(): Promise<unknown>
  onUpdateStatus(callback: (data: any) => void): () => void
  onUpdateProgress(callback: (data: any) => void): () => void
}

declare global {
  interface Window {
    api?: ElectronApi
  }
}
