/**
 * theme.ts — 应用主题（平铺：浅色/深色/海洋/森林……整体方案）
 *
 * 机制：
 * - 主题定义在 styles/themes/（palette.ts + index.ts）——
 *   applyTheme(themeId) 选中 Theme → resolveColors 解析色板 → applyColors 注入
 *   <html> 的 CSS 变量（--tk-*）
 * - scheme: 'light'/'dark' 固定明暗；'system' 跟随系统（监听 prefers-color-scheme）
 * - 偏好持久化在 app_settings 表（key: theme = 主题 id），本模块只负责应用
 */

import { getTheme, resolveColors, applyColors } from '@/renderer/styles/themes'

const SYSTEM_MQ = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null

let currentThemeId: string = 'light'
let systemListener: (() => void) | null = null

export function getThemeId(): string {
  return currentThemeId
}

/** 应用主题：注入配色 + 同步 data-theme 属性 + 按需跟随系统 */
export function applyTheme(themeId: string): void {
  currentThemeId = themeId
  if (!SYSTEM_MQ) return

  if (systemListener) {
    SYSTEM_MQ.removeEventListener('change', systemListener)
    systemListener = null
  }

  const theme = getTheme(themeId)
  const systemDark = SYSTEM_MQ.matches
  const colors = resolveColors(theme, systemDark)
  applyColors(colors)
  // data-theme 属性（MarkdownRender 等组件的 html[data-theme='dark'] 选择器依赖）
  // ⚠ 用 scheme 判定明暗——不能用 colors === theme.dark 引用比较
  // （浅色主题 light/dark 是同一对象引用——永远 true——会误标 dark）
  const isDark = theme.scheme === 'dark' || (theme.scheme === 'system' && systemDark)
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light'

  if (theme.scheme === 'system') {
    // 跟随系统深浅 + 监听切换（只换色板）
    systemListener = () => {
      const t = getTheme(currentThemeId)
      const c = resolveColors(t, SYSTEM_MQ.matches)
      applyColors(c)
      const d = t.scheme === 'dark' || (t.scheme === 'system' && SYSTEM_MQ.matches)
      document.documentElement.dataset.theme = d ? 'dark' : 'light'
    }
    SYSTEM_MQ.addEventListener('change', systemListener)
  }
}
