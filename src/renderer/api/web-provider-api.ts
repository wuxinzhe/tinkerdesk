/**
 * web-provider-api.ts — Web 工具（搜索/抓取）provider 配置 API
 * 供工具管理页的 L3 provider 设置页调用（WebProviderController）。
 */

export type WebInterfaceId = 'web.search' | 'web.extract'

export interface WebProviderInfo {
  pluginId: string
  name: string
  version: string
  interfaceVersion: number
}

export interface WebProviderListVO {
  iface: WebInterfaceId
  /** 插件 provider 列表（内置不在此——内置是工具内建兜底，前端固定展示） */
  providers: WebProviderInfo[]
  /** 当前激活插件 id（null = 内置） */
  activePluginId: string | null
  /** 失败回退内置开关 */
  fallback: boolean
}

export class WebProviderApi {
  async list(iface: WebInterfaceId): Promise<WebProviderListVO | null> {
    try {
      return await window.api.webProvider.list(iface)
    } catch {
      return null
    }
  }

  async set(payload: { iface: WebInterfaceId; pluginId?: string | null; fallback?: boolean }): Promise<WebProviderListVO | null> {
    try {
      return await window.api.webProvider.set(payload)
    } catch {
      return null
    }
  }
}

/** 默认实例 */
export const webProviderApi = new WebProviderApi()
