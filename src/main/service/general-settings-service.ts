import { getDatabase } from '../repository/database'
import type { DatabaseSync } from 'node:sqlite'

/**
 * 应用级通用设置（快捷键等全局键值配置）——持久化于 app_settings 表。
 * 默认值：shortcut.record = 'ctrl+backquote'（Ctrl+` 按住录音）
 */

export interface AppSettingsPayload {
  /** 全部配置键值（含默认值兜底） */
  settings: Record<string, string>
  /** 可配置的快捷键项（供设置页渲染快捷键配置组） */
  shortcuts: Array<{ key: string; label: string; description: string; value: string }>
}

const DEFAULT_SHORTCUTS: Array<{ key: string; label: string; description: string; value: string }> = [
  {
    key: 'shortcut.record',
    label: '按住录音',
    description: '聊天页按住该快捷键开始录音，松开结束',
    value: 'ctrl+b'
  }
]

function getDb(): DatabaseSync {
  return getDatabase()
}

/** 读取全部快捷键配置（未配置的返回默认值） */
export function getAppSettings(): AppSettingsPayload {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as Array<{ key: string; value: string }>
  const stored = new Map(rows.map((r) => [r.key, r.value]))
  const settings: Record<string, string> = {}
  const shortcuts = DEFAULT_SHORTCUTS.map((s) => {
    const value = stored.get(s.key) ?? s.value
    settings[s.key] = value
    return { ...s, value }
  })
  return { settings, shortcuts }
}

/** 写入单个配置项（upsert） */
export function setAppSetting(key: string, value: string): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, value)
}

/** 重置单个配置项为默认值 */
export function resetAppSetting(key: string): void {
  getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(key)
}
