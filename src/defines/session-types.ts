/**
 * session-types.ts — 会话/连接类型定义
 *
 * 从 src/stores/session-store.ts 提取。
 * 注意：此 PlatformCapabilities 与 src/defines/api/backend-types.ts 中的不同：
 * - 此处的 platformName 为 string（非 literal union 'desktop' | 'web'）
 */

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export interface PlatformCapabilities {
  platformName: string
  nativeFileDialog: boolean
  hasTerminal: boolean
  hasFileRead: boolean
}
