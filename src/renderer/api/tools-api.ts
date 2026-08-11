/**
 * tools.api.ts — 数据层
 * 工具配置 API（本地 IPC，走 ToolController）
 */
import type { ToolItem } from '@/renderer/api/types'
import type { ApiResponse } from '@/renderer/api/types'
import '@/renderer/api/types'

export class ToolsApi {
  async list(profile: string, toolType?: string): Promise<ToolItem[]> {
    const data = await window.api.tools.list({ profile, toolType })
    return (data as ToolItem[]) ?? []
  }

  async toggle(toolName: string, disabled: boolean, profile: string): Promise<ApiResponse> {
    try {
      await window.api.tools.toggle(toolName, disabled, profile)
      return { success: true, data: null }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }
}

/** 默认实例 */
export const toolsApi = new ToolsApi()
