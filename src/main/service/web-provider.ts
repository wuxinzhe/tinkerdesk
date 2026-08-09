/**
 * web-provider-service.ts — Web 工具（搜索/抓取）的多 provider 抽象
 *
 * 系统开放接口（固定契约）：
 *   web.search   → 插件实现 search:query（{ query, limit } → { results: [{title,url,description}] }）
 *   web.extract  → 插件实现 extract:fetch（{ url, limit? } → { content, title? }）
 *
 * 与 voice-provider-service 的区别：内置实现（Bing/Cheerio 等）是工具内建的兜底，
 * 不注册进插件表——激活配置为 null 时用内置；选了插件则优先插件。
 * 前端工具管理页（supportsProvider 的工具）在此选择激活 provider。
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { PluginManager } from '../core/plugin/plugin-manager'
import type { PluginManifest } from '../core/plugin/types'

/** Web 系统接口（与 SYSTEM_INTERFACES 一致） */
export type WebInterfaceId = 'web.search' | 'web.extract'

export interface WebProviderInfo {
  pluginId: string
  name: string
  version: string
  interfaceVersion: number
}

export interface WebProviderConfig {
  /** 激活的插件 provider id（null = 内置兜底） */
  search: string | null
  extract: string | null
  /** 插件 provider 失败时自动回退内置（默认开） */
  fallback: boolean
}

/** 接口 → 插件注册频道（固定契约） */
const INTERFACE_CHANNELS: Record<WebInterfaceId, string> = {
  'web.search': 'search:query',
  'web.extract': 'extract:fetch',
}

const CONFIG_KEY: Record<WebInterfaceId, 'search' | 'extract'> = {
  'web.search': 'search',
  'web.extract': 'extract',
}

export class WebProvider {
  private readonly configFile: string

  constructor(private readonly pluginManager: PluginManager) {
    this.configFile = join(app.getPath('userData'), 'web-provider-config.json')
  }

  /** 收集某接口的插件 provider（内置不在此——内置是工具内建兜底） */
  providers(iface: WebInterfaceId): WebProviderInfo[] {
    const toInfo = (r: { manifest: PluginManifest }): WebProviderInfo => ({
      pluginId: r.manifest.id,
      name: r.manifest.name,
      version: r.manifest.version,
      interfaceVersion: r.manifest.systemInterfaces?.find((i) => i.id === iface)?.version ?? 1,
    })
    return this.pluginManager.getProviders(iface).map(toInfo)
  }

  /** 读取激活配置（默认内置兜底） */
  getConfig(): WebProviderConfig {
    const stored = this.readStored()
    return {
      search: stored.search && this.exists('web.search', stored.search) ? stored.search : null,
      extract: stored.extract && this.exists('web.extract', stored.extract) ? stored.extract : null,
      fallback: stored.fallback !== false,
    }
  }

  /** 保存激活配置 */
  setConfig(patch: Partial<WebProviderConfig>): WebProviderConfig {
    const current = this.readStored()
    writeFileSync(this.configFile, JSON.stringify({ ...current, ...patch }, null, 2), 'utf-8')
    return this.getConfig()
  }

  /** 激活的插件 provider id（null = 用内置） */
  getActivePlugin(iface: WebInterfaceId): string | null {
    return this.getConfig()[CONFIG_KEY[iface]]
  }

  /** 是否允许失败回退内置 */
  allowFallback(): boolean {
    return this.getConfig().fallback
  }

  /** 调用激活的插件 provider；未激活抛错（调用方决定回退内置） */
  async callPlugin<T = unknown>(iface: WebInterfaceId, payload: unknown): Promise<T> {
    const pluginId = this.getActivePlugin(iface)
    if (!pluginId) throw new Error(`未激活 ${iface} 插件 provider（工具设置中选择）`)
    return this.pluginManager.invokePlugin<T>(pluginId, INTERFACE_CHANNELS[iface], payload)
  }

  private exists(iface: WebInterfaceId, pluginId: string): boolean {
    return this.providers(iface).some((p) => p.pluginId === pluginId)
  }

  private readStored(): WebProviderConfig {
    if (!existsSync(this.configFile)) return { search: null, extract: null, fallback: true }
    try {
      const raw = JSON.parse(readFileSync(this.configFile, 'utf-8'))
      return {
        search: raw.search ?? null,
        extract: raw.extract ?? null,
        fallback: raw.fallback !== false,
      }
    } catch {
      return { search: null, extract: null, fallback: true }
    }
  }
}
