/**
 * theme.ts — 应用主题控制（浅色/深色/跟随系统）
 *
 * 通过 <html data-theme="dark"> 驱动 CSS 变量切换（variables.css 的
 * html[data-theme='dark'] 块）；'light' 时移除属性（浅色为默认）。
 * 偏好持久化在 app_settings 表（key: theme），本模块只负责应用。
 */

export type ThemePreference = 'light' | 'dark' | 'system'

const SYSTEM_MQ = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null

let current: ThemePreference = 'light'
let systemListener: (() => void) | null = null

export function getThemePreference(): ThemePreference {
  return current
}

/** 应用主题到 <html>；'system' 时跟随系统并监听变化 */
export function applyTheme(pref: ThemePreference): void {
  current = pref
  if (!SYSTEM_MQ) return

  if (systemListener) {
    SYSTEM_MQ.removeEventListener('change', systemListener)
    systemListener = null
  }

  if (pref === 'dark') {
    document.documentElement.dataset.theme = 'dark'
    return
  }
  if (pref === 'light') {
    delete document.documentElement.dataset.theme
    return
  }

  // system：跟随系统深浅 + 监听系统切换
  document.documentElement.dataset.theme = SYSTEM_MQ.matches ? 'dark' : 'light'
  systemListener = () => {
    document.documentElement.dataset.theme = SYSTEM_MQ.matches ? 'dark' : 'light'
  }
  SYSTEM_MQ.addEventListener('change', systemListener)
}
