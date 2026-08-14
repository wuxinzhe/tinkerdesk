/**
 * web-provider-controller.ts — Web 工具（搜索/抓取）provider 配置 IPC controller
 *
 * Called from the tool-management L3 settings page (tools with supportsProvider):
 *   web-provider:list  → plugin provider list for an interface + active config
 *   web-provider:set   → set active provider / fallback toggle
 *
 * Layering: controller → WebProvider (tool-domain service layer).
 * Structure: register() only binds ipcMain.handle; logic lives in named methods.
 */

import { handleTrusted } from '../security/ipc-guard'
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
    handleTrusted('web-provider:list', (_event, payload) => this.listProviders(payload))
    handleTrusted('web-provider:set', (_event, payload) => this.setProvider(payload))
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
