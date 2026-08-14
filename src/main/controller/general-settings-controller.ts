/**
 * general-settings-controller.ts — 通用设置 IPC（快捷键等全局配置）
 *
 * Channels:
 *   settings:general:get  → { settings, shortcuts } full config (with defaults fallback)
 *   settings:general:set  → write single config { key, value }
 *   settings:general:reset → reset single config to default { key }
 */

import { handleTrusted } from '../security/ipc-guard'
import { getAppSettings, setAppSetting, resetAppSetting } from '../service/general-settings-service'

type ApiResult<T> = { success: true; data: T } | { success: false; error: string }

function ok<T>(data: T): ApiResult<T> {
  return { success: true, data }
}
function fail(error: string): ApiResult<never> {
  return { success: false, error }
}

export class GeneralSettingsController {
  register(): void {
    handleTrusted('settings:general:get', () => this.get())
    handleTrusted('settings:general:set', (_event, payload: { key: string; value: string }) =>
      this.set(payload),
    )
    handleTrusted('settings:general:reset', (_event, payload: { key: string }) =>
      this.reset(payload),
    )
  }

  private get(): ApiResult<ReturnType<typeof getAppSettings>> {
    try {
      return ok(getAppSettings())
    } catch (e) {
      return fail(e instanceof Error ? e.message : '读取通用设置失败')
    }
  }

  private set(payload: { key: string; value: string }): ApiResult<never> {
    try {
      if (!payload?.key) return fail('缺少配置键')
      setAppSetting(payload.key, payload.value)
      return ok(undefined as never)
    } catch (e) {
      return fail(e instanceof Error ? e.message : '保存通用设置失败')
    }
  }

  private reset(payload: { key: string }): ApiResult<never> {
    try {
      if (!payload?.key) return fail('缺少配置键')
      resetAppSetting(payload.key)
      return ok(undefined as never)
    } catch (e) {
      return fail(e instanceof Error ? e.message : '重置通用设置失败')
    }
  }
}
