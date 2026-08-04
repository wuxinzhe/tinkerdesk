/**
 * sandbox.api.ts — 数据层
 * 沙盒白名单 API
 */
import { HttpClient, http as defaultHttp } from './http-client'
import type { UrlWhitelistItem, PathWhitelistItem } from '@/defines/api/sandbox-types'

export class SandboxApi {
  constructor(private http: HttpClient) {}

  // ── URL 白名单 ──
  async listUrlWhitelist(profile = 'default'): Promise<UrlWhitelistItem[]> {
    const res = await this.http.get<UrlWhitelistItem[]>('/sandbox/whitelist/url', { params: { profile } })
    return res.data ?? []
  }

  async addUrlWhitelist(data: { urlPattern: string; description?: string; profile?: string }): Promise<void> {
    await this.http.post('/sandbox/whitelist/url', data)
  }

  async deleteUrlWhitelist(id: number, profile = 'default'): Promise<void> {
    await this.http.del(`/sandbox/whitelist/url/${id}`, { params: { profile } })
  }

  // ── 路径白名单 ──
  async listPathWhitelist(profile = 'default'): Promise<PathWhitelistItem[]> {
    const res = await this.http.get<PathWhitelistItem[]>('/sandbox/whitelist/path', { params: { profile } })
    return res.data ?? []
  }

  async addPathWhitelist(data: { pathPattern: string; description?: string; profile?: string }): Promise<void> {
    await this.http.post('/sandbox/whitelist/path', data)
  }

  async deletePathWhitelist(id: number, profile = 'default'): Promise<void> {
    await this.http.del(`/sandbox/whitelist/path/${id}`, { params: { profile } })
  }
}

/** 默认实例 */
export const sandboxApi = new SandboxApi(defaultHttp)
