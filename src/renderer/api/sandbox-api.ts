/**
 * sandbox.api.ts — 数据层
 * 沙盒白名单 API（本地 IPC，走 SandboxController）
 */
import type { UrlWhitelistItem, PathWhitelistItem } from '@/renderer/api/types'
import '@/renderer/api/types'

export class SandboxApi {
  async listUrlWhitelist(profile = 'default'): Promise<UrlWhitelistItem[]> {
    const data = await window.api.sandbox.listUrl(profile)
    return (data as UrlWhitelistItem[]) ?? []
  }

  async addUrlWhitelist(data: { urlPattern: string; description?: string; profile?: string }): Promise<void> {
    await window.api.sandbox.addUrl(data)
  }

  async deleteUrlWhitelist(id: number, profile = 'default'): Promise<void> {
    await window.api.sandbox.deleteUrl(id, profile)
  }

  async listPathWhitelist(profile = 'default'): Promise<PathWhitelistItem[]> {
    const data = await window.api.sandbox.listPath(profile)
    return (data as PathWhitelistItem[]) ?? []
  }

  async addPathWhitelist(data: { pathPattern: string; description?: string; profile?: string }): Promise<void> {
    await window.api.sandbox.addPath(data)
  }

  async deletePathWhitelist(id: number, profile = 'default'): Promise<void> {
    await window.api.sandbox.deletePath(id, profile)
  }
}

/** 默认实例 */
export const sandboxApi = new SandboxApi()
