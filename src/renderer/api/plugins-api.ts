/**
 * plugins-api.ts — 插件系统 API 封装
 *
 * 统一走 preload window.api.plugins（IPC 前缀 plugin:*）。
 * 插件事件（plugin:event）由组件层监听 window CustomEvent。
 */
import type {
  ConfigSchema,
  MarketListResult,
  PluginCheckResult,
  PluginInfo,
  PluginStatus,
  ToggleResult,
} from '@/renderer/api/types'

export interface PluginApi {
  list(): Promise<PluginInfo[]>
  toggle(id: string, enabled: boolean): Promise<ToggleResult>
  check(id: string): Promise<PluginCheckResult>
  /** 安装插件：路径可为插件文件夹或 .zip 插件包（自动检测） */
  install(path: string): Promise<PluginInfo>
  /** 在线安装（npm 包名） */
  installNpm(pkg: string, registry?: string): Promise<PluginInfo>
  /** 分步安装：开始会话 */
  installStart(payload: { pkg?: string; path?: string; registry?: string }): Promise<InstallSessionInfo>
  /** 分步安装：执行下一步 */
  installStep(sessionId: string, stage: string, skipAssets?: string[]): Promise<{ ok: boolean; error?: string; stages: Record<string, 'pending' | 'running' | 'done' | 'failed'> }>
  /** 插件市场列表（npm registry search——分类/搜索词真实查询） */
  marketList(payload?: { category?: string; search?: string }): Promise<MarketListResult>
  /** 卸载插件（删除插件及下载的模型） */
  uninstall(id: string): Promise<void>
  getStatus(id: string): Promise<PluginStatus>
  getSchema(id: string): Promise<ConfigSchema | null>
  getConfig(id: string): Promise<Record<string, unknown>>
  saveConfig(id: string, patch: Record<string, unknown>): Promise<boolean>
  /** 调用插件注册的 IPC 能力（如 models:download） */
  invokePlugin<T = unknown>(id: string, channel: string, payload?: unknown): Promise<T>
}

/** 监听插件事件（返回取消函数） */
export function onPluginEvent(handler: (detail: { pluginId: string; event: string; data?: unknown }) => void): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<{ pluginId: string; event: string; data?: unknown }>).detail
    if (detail) handler(detail)
  }
  window.addEventListener('plugin:event', listener)
  return () => window.removeEventListener('plugin:event', listener)
}

export const pluginsApi: PluginApi = {
  list: () => window.api.plugins.list(),
  toggle: (id, enabled) => window.api.plugins.toggle(id, enabled),
  check: (id) => window.api.plugins.check(id),
  install: (path) => window.api.plugins.install(path),
  /** 在线安装（npm 包名） */
  installNpm: (pkg, registry) => window.api.plugins.installNpm(pkg, registry),
  /** 分步安装：开始会话 */
  installStart: (payload) => window.api.plugins.installStart(payload),
  /** 分步安装：执行下一步 */
  installStep: (sessionId, stage, skipAssets) => window.api.plugins.installStep(sessionId, stage, skipAssets),
  /** 插件市场列表（npm registry search） */
  marketList: (payload?: { category?: string; search?: string }) => window.api.plugins.marketList(payload),
  uninstall: (id) => window.api.plugins.uninstall(id),
  getStatus: (id) => window.api.plugins.getStatus(id),
  getSchema: (id) => window.api.plugins.getSchema(id),
  getConfig: (id) => window.api.plugins.getConfig(id),
  saveConfig: (id, patch) => window.api.plugins.saveConfig(id, patch),
  invokePlugin: <T = unknown>(id: string, channel: string, payload?: unknown) =>
    window.api.plugins.invoke(id, channel, payload) as Promise<T>,
}
