/**
 * tools.api.ts — 数据层
 * 工具清单 API（获取工具列表 + 启用/禁用）
 */
import { HttpClient, http as defaultHttp, getConnectId } from './http-client'
import type { ToolItem } from '@/defines/tools/types'
import type { ApiResponse } from '@/defines/api/types'

export class ToolsApi {
  constructor(private http: HttpClient) {}

  async list(profile = 'default'): Promise<ToolItem[]> {
    const params: Record<string, string> = { profile }
    const connectId = getConnectId()
    if (connectId) params.connectId = connectId
    const res = await this.http.get<ToolItem[]>('/tools', { params })
    return res.data ?? []
  }

  async toggle(toolName: string, disabled: boolean, profile = 'default'): Promise<ApiResponse> {
    const params: Record<string, string> = { profile }
    const connectId = getConnectId()
    if (connectId) params.connectId = connectId
    return await this.http.patch(`/tools/${toolName}`, { disabled }, { params })
  }
}

/** 默认实例 */
export const toolsApi = new ToolsApi(defaultHttp)
