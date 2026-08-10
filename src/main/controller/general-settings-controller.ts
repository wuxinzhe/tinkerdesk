/**
 * general-settings-controller.ts — 通用设置 IPC（快捷键等全局配置）
 *
 * 频道：
 *   settings:general:get  → { settings, shortcuts } 全部配置（含默认值兜底）
 *   settings:general:set  → 写入单个配置 { key, value }
 *   settings:general:reset → 重置单个配置为默认 { key }
 */

import { handleTrusted } from '../security/ipc-guard'
import { getAppSettings, setAppSetting, resetAppSetting } from '../service/general-settings-service'
import { syncRecordGlobalShortcut } from '../global-shortcut-manager'
import { BrowserWindow } from 'electron'

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
      // 快捷键/全局开关变更 → 同步全局快捷键（冲突时返回 false 由调用方提示）
      if (payload.key === 'shortcut.record' || payload.key === 'shortcut.recordGlobal') {
        this.syncShortcut(payload.key, payload.value)
      }
      return ok(undefined as never)
    } catch (e) {
      return fail(e instanceof Error ? e.message : '保存通用设置失败')
    }
  }

  private reset(payload: { key: string }): ApiResult<never> {
    try {
      if (!payload?.key) return fail('缺少配置键')
      resetAppSetting(payload.key)
      if (payload.key === 'shortcut.record' || payload.key === 'shortcut.recordGlobal') {
        this.syncShortcut(payload.key)
      }
      return ok(undefined as never)
    } catch (e) {
      return fail(e instanceof Error ? e.message : '重置通用设置失败')
    }
  }

  /** 同步录音全局快捷键（变更后重新注册；冲突提示） */
  private syncShortcut(changedKey: string, value?: string): void {
    try {
      const result = syncRecordGlobalShortcut()
      if (!result.ok && changedKey === 'shortcut.recordGlobal' && value === 'true') {
        // 开启全局但快捷键被占用——提示换键（其余静默——注销/关闭无需提示）
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('global-tip', {
            type: 'error',
            code: 'shortcut:global:conflict',
            message: `全局快捷键 ${result.accelerator} 已被其他应用占用——请更换录音快捷键`,
          })
        }
      }
    } catch (e) {
      console.warn(`[shortcut] 同步全局快捷键失败: ${(e as Error).message}`)
    }
  }
}
