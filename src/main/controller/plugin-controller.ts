/**
 * plugin-controller.ts — 插件管理 IPC（对齐 Controller 规范：独立具名方法 + register 绑定）
 *
 * 频道：
 *   plugin:list         → 插件列表（manifest + 状态）
 *   plugin:toggle       → 启停插件 { id, enabled }
 *   plugin:get-status   → 实时状态（含插件自定义 detail）
 *   plugin:get-schema   → 配置 Schema（动态表单渲染）
 *   plugin:get-config   → 读取配置（secret 脱敏）
 *   plugin:save-config  → 保存配置 { id, patch }
 */
import { ipcMain } from 'electron'
import { PluginManager } from '../core/plugin/plugin-manager'
import type { PluginInfo, PluginStatus } from '../core/plugin/types'

type ApiResult<T> = { success: true; data: T } | { success: false; error: string }

function ok<T>(data: T): ApiResult<T> {
  return { success: true, data }
}
function fail(error: string): ApiResult<never> {
  return { success: false, error }
}

export class PluginController {
  constructor(private readonly pluginManager: PluginManager) {}

  register(): void {
    ipcMain.handle('plugin:list', () => this.listPlugins())
    ipcMain.handle('plugin:toggle', (_event, payload: { id: string; enabled: boolean }) =>
      this.togglePlugin(payload),
    )
    ipcMain.handle('plugin:get-status', (_event, payload: { id: string }) =>
      this.getPluginStatus(payload),
    )
    ipcMain.handle('plugin:get-schema', (_event, payload: { id: string }) =>
      this.getPluginSchema(payload),
    )
    ipcMain.handle('plugin:get-config', (_event, payload: { id: string }) =>
      this.getPluginConfig(payload),
    )
    ipcMain.handle('plugin:save-config', (_event, payload: { id: string; patch: Record<string, unknown> }) =>
      this.savePluginConfig(payload),
    )
  }

  /** 插件列表 */
  private listPlugins(): ApiResult<PluginInfo[]> {
    try {
      return ok(this.pluginManager.list())
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 启停插件 */
  private async togglePlugin(payload: { id: string; enabled: boolean }): Promise<ApiResult<boolean>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      return ok(await this.pluginManager.toggle(payload.id, !!payload.enabled))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 实时状态 */
  private async getPluginStatus(payload: { id: string }): Promise<ApiResult<PluginStatus>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      return ok(await this.pluginManager.getStatus(payload.id))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 配置 Schema */
  private getPluginSchema(payload: { id: string }): ApiResult<unknown> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      return ok(this.pluginManager.getSchema(payload.id))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 读取配置（secret 脱敏） */
  private getPluginConfig(payload: { id: string }): ApiResult<Record<string, unknown>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      return ok(this.pluginManager.getConfig(payload.id))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 保存配置 */
  private savePluginConfig(payload: { id: string; patch: Record<string, unknown> }): ApiResult<boolean> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      this.pluginManager.saveConfig(payload.id, payload.patch ?? {})
      return ok(true)
    } catch (e) {
      return fail((e as Error).message)
    }
  }
}
