/**
 * tools.api.ts — 数据层
 * 工具配置 API（本地 IPC，走 ToolController）+ 工具市场 API（ToolCenter）
 */
import type { ToolItem, MarketToolDetail, ApiResponse } from '@/renderer/api/types'

export class ToolsApi {
  /** 工具清单（按 profile 的 AgentMode 过滤） */
  async list(profile: string): Promise<ToolItem[]> {
    const data = await window.api.tools.list({ profile })
    return (data as ToolItem[]) ?? []
  }

  /** 授权切换（creator 模式） */
  async toggle(toolName: string, authorized: boolean, profile: string): Promise<ApiResponse> {
    try {
      await window.api.tools.toggle(toolName, authorized, profile)
      return { success: true, data: null }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }

  /** 工具市场详情（含 README） */
  async marketDetail(name: string): Promise<MarketToolDetail | undefined> {
    return window.api.toolCenter.marketDetail(name)
  }

  /** 安装工具包 */
  async installTool(pkg: string, registry?: string): Promise<ApiResponse> {
    try {
      await window.api.toolCenter.install(pkg, registry)
      return { success: true, data: null }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }
}

/** 默认实例 */
export const toolsApi = new ToolsApi()
