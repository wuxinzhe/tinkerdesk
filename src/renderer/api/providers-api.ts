/**
 * providers-api.ts — 扩展系统 API 封装
 *
 * 统一走 preload window.api.providers（IPC 前缀 provider:*）。
 * 扩展事件（provider:event）由组件层监听 window CustomEvent。
 */
import type {
  ConfigSchema,
  InstallSessionInfo,
  MarketListResult,
  MarketProviderDetail,
  ProviderCheckResult,
  ProviderInfo,
  ProviderStatus,
  ToggleResult,
} from '@/renderer/api/types'

export interface ProviderApi {
  list(): Promise<ProviderInfo[]>
  toggle(id: string, enabled: boolean): Promise<ToggleResult>
  check(id: string): Promise<ProviderCheckResult>
  /** 安装扩展：路径可为扩展文件夹或 .zip 扩展包（自动检测） */
  install(path: string): Promise<ProviderInfo>
  /** 在线安装（npm 包名） */
  installNpm(pkg: string, registry?: string): Promise<ProviderInfo>
  /** 分步安装：开始会话 */
  installStart(payload: { pkg?: string; path?: string; registry?: string }): Promise<InstallSessionInfo>
  /** 分步安装：执行下一步 */
  installStep(sessionId: string, stage: string, skipAssets?: string[]): Promise<{ ok: boolean; error?: string; stages: Record<string, 'pending' | 'running' | 'done' | 'failed'> }>
  /** 分步安装：下载 tarball（进度经 provider:install-progress 事件推送） */
  installDownload(sessionId: string): Promise<{ ok: boolean; stages: Record<string, 'pending' | 'running' | 'done' | 'failed'>; manifest?: { id: string; name: string; version: string; capabilities: string[] } | null; assetDeps?: { name: string; dest: string; sizeMB: number; optional: boolean }[] }>
  /** 扩展市场列表（npm registry search——分类/搜索词真实查询） */
  marketList(payload?: { category?: string; search?: string }): Promise<MarketListResult>
  /** 扩展市场详情（npm 包元数据 + readme） */
  marketDetail(name: string): Promise<MarketProviderDetail>
  /** 卸载扩展（删除扩展及下载的模型） */
  uninstall(id: string): Promise<void>
  getStatus(id: string): Promise<ProviderStatus>
  getSchema(id: string): Promise<ConfigSchema | null>
  getConfig(id: string): Promise<Record<string, unknown>>
  saveConfig(id: string, patch: Record<string, unknown>): Promise<boolean>
  /** 调用扩展注册的 IPC 能力（如 models:download） */
  invokeProvider<T = unknown>(id: string, channel: string, payload?: unknown): Promise<T>
}

/** 监听扩展事件（返回取消函数） */
export function onProviderEvent(handler: (detail: { providerId: string; event: string; data?: unknown }) => void): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<{ providerId: string; event: string; data?: unknown }>).detail
    if (detail) handler(detail)
  }
  window.addEventListener('provider:event', listener)
  return () => window.removeEventListener('provider:event', listener)
}

export const providersApi: ProviderApi = {
  list: () => window.api.providers.list(),
  toggle: (id, enabled) => window.api.providers.toggle(id, enabled),
  check: (id) => window.api.providers.check(id),
  install: (path) => window.api.providers.install(path),
  /** 在线安装（npm 包名） */
  installNpm: (pkg, registry) => window.api.providers.installNpm(pkg, registry),
  /** 分步安装：开始会话 */
  installStart: (payload) => window.api.providers.installStart(payload),
  /** 分步安装：执行下一步 */
  installStep: (sessionId, stage, skipAssets) => window.api.providers.installStep(sessionId, stage, skipAssets),
  /** 分步安装：下载 tarball */
  installDownload: (sessionId) => window.api.providers.installDownload(sessionId),
  /** 扩展市场列表（npm registry search） */
  marketList: (payload?: { category?: string; search?: string }) => window.api.providers.marketList(payload),
  /** 扩展市场详情 */
  marketDetail: (name) => window.api.providers.marketDetail(name),
  uninstall: (id) => window.api.providers.uninstall(id),
  getStatus: (id) => window.api.providers.getStatus(id),
  getSchema: (id) => window.api.providers.getSchema(id),
  getConfig: (id) => window.api.providers.getConfig(id),
  saveConfig: (id, patch) => window.api.providers.saveConfig(id, patch),
  invokeProvider: <T = unknown>(id: string, channel: string, payload?: unknown) =>
    window.api.providers.invoke(id, channel, payload) as Promise<T>,
}
