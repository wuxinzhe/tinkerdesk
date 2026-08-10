/**
 * global-shortcut-manager.ts — 录音全局快捷键管理
 *
 * 方案 A（toggle）：按下开始录音 / 再按结束发送。
 * Electron 的 globalShortcut 只有 keydown 事件——没有全局 keyup，
 * "按住录音/松开结束"需要原生键盘钩子（uiohook）——toggle 是原生可做的上限。
 *
 * 设置：shortcut.record（'ctrl+b'）+ shortcut.recordGlobal（'true'/'false'）
 * 链路：globalShortcut 按下 → webContents.send('global-shortcut-record')
 *       → preload 转发 → ChatInput toggle 录音
 */
import { globalShortcut, BrowserWindow } from 'electron'
import { getAppSettings } from './service/general-settings-service'

/** 设置键 */
export const SETTING_RECORD_GLOBAL = 'shortcut.recordGlobal'

/** 'ctrl+b' → 'CommandOrControl+B'（Electron accelerator 格式） */
export function toAccelerator(shortcut: string): string {
  return shortcut
    .split('+')
    .map((part) => {
      const p = part.trim().toLowerCase()
      if (p === 'ctrl') return 'CommandOrControl'
      if (p === 'shift') return 'Shift'
      if (p === 'alt') return 'Alt'
      if (p === 'meta') return 'Super'
      if (p === 'backquote') return '`'
      return p.toUpperCase()
    })
    .join('+')
}

/**
 * 按当前设置同步全局快捷键：
 * - shortcut.recordGlobal !== 'true' → 注销（不全局）
 * - 否则注册（先注销旧的再注册——设置变更可重新同步）
 * 返回 { ok, accelerator?, reason? }——冲突（被占用）时 ok=false
 */
export function syncRecordGlobalShortcut(): { ok: boolean; accelerator?: string; reason?: string } {
  const { settings } = getAppSettings()
  const acc = toAccelerator(settings['shortcut.record'] || 'ctrl+b')

  if (settings[SETTING_RECORD_GLOBAL] !== 'true') {
    globalShortcut.unregister(acc)
    return { ok: true }
  }

  // 先注销旧的（可能已注册同键）——再注册
  globalShortcut.unregister(acc)
  const ok = globalShortcut.register(acc, () => {
    // 按下（toggle）→ 通知 renderer 切换录音
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('global-shortcut-record')
    }
  })

  if (!ok) {
    return { ok: false, accelerator: acc, reason: '快捷键已被其他应用占用' }
  }
  return { ok: true, accelerator: acc }
}

/** 应用退出清理 */
export function unregisterRecordShortcut(): void {
  const { settings } = getAppSettings()
  globalShortcut.unregister(toAccelerator(settings['shortcut.record'] || 'ctrl+b'))
}
