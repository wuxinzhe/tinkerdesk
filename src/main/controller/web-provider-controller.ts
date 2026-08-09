/**
 * web-provider-controller.ts — Web 工具（搜索/抓取）provider 配置 IPC controller
 *
 * 前端工具管理页（supportsProvider 的工具）的 L3 设置页调用：
 *   web-provider:list  → 某接口的插件 provider 列表 + 激活配置
 *   web-provider:set   → 设置激活 provider / 回退开关
 *
 * 分层：controller → WebProvider（工具域 service 层）。
 * 结构：register() 只做 ipcMain.handle 绑定，逻辑在独立具名方法。
 */
import { ipcMain } from 'electron'
import type { WebProvider, WebInterfaceId, WebProviderInfo, WebProviderConfig } from '../service/web-provider'
import type { ApiResponse } from './api-response'
import { ok, fail } from './api-response'

export interface WebProviderListDTO {
  iface: WebInterfaceId
}

export interface WebProviderSetDTO {
  iface: WebInterfaceId
  /** 激活插件 id（null/'' = 内置兜底） */
  pluginId?: string | null
  /** 失败回退内置开关（可选） */
  fallback?: boolean
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

/** Web provider controller */
export class WebProviderController {
  constructor(private readonly webProviderService: WebProvider) { }

  register(): void {
    ipcMain.handle('web-provider:list', (_event, payload) => this.listProviders(payload))
    ipcMain.handle('web-provider:set', (_event, payload) => this.setProvider(payload))
  }

  private listProviders(payload: WebProviderListDTO): ApiResponse<WebProviderListVO> {
    const iface = payload?.iface
    if (iface !== 'web.search' && iface !== 'web.extract') {
      return fail('iface 必须是 web.search 或 web.extract')
    }
    const config = this.webProviderService.getConfig()
    return ok({
      iface,
      providers: this.webProviderService.providers(iface),
      activePluginId: this.webProviderService.getActivePlugin(iface),
      fallback: config.fallback,
    })
  }

  private setProvider(payload: WebProviderSetDTO): ApiResponse<WebProviderListVO> {
    const iface = payload?.iface
    if (iface !== 'web.search' && iface !== 'web.extract') {
      return fail('iface 必须是 web.search 或 web.extract')
    }
    const patch: Partial<WebProviderConfig> = {}
    if (payload.pluginId !== undefined) {
      const pluginId = payload.pluginId || null
      if (pluginId && !this.webProviderService.providers(iface).some((p) => p.pluginId === pluginId)) {
        return fail(`插件 provider 不存在: ${pluginId}`)
      }
      if (iface === 'web.search') patch.search = pluginId
      else patch.extract = pluginId
    }
    if (payload.fallback !== undefined) patch.fallback = payload.fallback
    this.webProviderService.setConfig(patch)
    return this.listProviders({ iface })
  }
}
