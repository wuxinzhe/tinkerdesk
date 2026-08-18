/**
 * web-provider-service.ts — Web 工具（搜索/抓取）的多 provider 抽象
 *
 * 系统开放接口（固定契约）：
 *   web.search   → 扩展实现 search:query（{ query, limit } → { results: [{title,url,description}] }）
 *   web.extract  → 扩展实现 extract:fetch（{ url, limit? } → { content, title? }）
 *
 * 与 voice-provider-service 的区别：内置实现（Bing/Cheerio 等）是工具内建的兜底，
 * 不注册进扩展表——激活配置为 null 时用内置；选了扩展则优先扩展。
 * 前端工具管理页（supportsProvider 的工具）在此选择激活 provider。
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getAppUserDataPath } from '../utils/electron-app'
import { ProviderCenter } from '../core/provider/provider-center'
import type { ProviderManifest } from '../core/provider/types'

/** Web 系统接口（与 SYSTEM_INTERFACES 一致） */
export type WebInterfaceId = 'web.search' | 'web.extract'

export interface WebProviderInfo {
  providerId: string
  name: string
  version: string
  interfaceVersion: number
}

export interface WebProviderConfig {
  /** 激活的扩展 provider id（null = 内置兜底） */
  search: string | null
  extract: string | null
  /** 扩展 provider 失败时自动回退内置（默认开） */
  fallback: boolean
}

/** 接口 → 扩展注册频道（固定契约） */
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

  constructor(private readonly providerCenter: ProviderCenter) {
    this.configFile = join(getAppUserDataPath(), 'web-provider-config.json')
  }

  /** 收集某接口的扩展 provider（内置不在此——内置是工具内建兜底） */
  providers(iface: WebInterfaceId): WebProviderInfo[] {
    const toInfo = (r: { manifest: ProviderManifest }): WebProviderInfo => ({
      providerId: r.manifest.id,
      name: r.manifest.name,
      version: r.manifest.version,
      interfaceVersion: r.manifest.systemInterfaces?.find((i) => i.id === iface)?.version ?? 1,
    })
    return this.providerCenter.getProviders(iface).map(toInfo)
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

  /** 激活的扩展 provider id（null = 用内置） */
  getActiveProvider(iface: WebInterfaceId): string | null {
    return this.getConfig()[CONFIG_KEY[iface]]
  }

  /** 是否允许失败回退内置 */
  allowFallback(): boolean {
    return this.getConfig().fallback
  }

  /** 调用激活的扩展 provider；未激活抛错（调用方决定回退内置） */
  async callProvider<T = unknown>(iface: WebInterfaceId, payload: unknown): Promise<T> {
    const providerId = this.getActiveProvider(iface)
    if (!providerId) throw new Error(`未激活 ${iface} 扩展 provider（工具设置中选择）`)
    return this.providerCenter.invokeProvider<T>(providerId, INTERFACE_CHANNELS[iface], payload)
  }

  private exists(iface: WebInterfaceId, providerId: string): boolean {
    return this.providers(iface).some((p) => p.providerId === providerId)
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
