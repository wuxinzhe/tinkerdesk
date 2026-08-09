/**
 * index.ts — 主题注册表（平铺：浅色/深色/海洋/森林……并列）
 *
 * 新增主题步骤：
 * 1. 新建 <name>.ts 实现 Theme（light/dark 全量 + scheme——类型约束漏键报错）
 * 2. 在 THEMES 数组注册一行——设置页自动出现、全站生效
 */

import { DEFAULT_LIGHT, DEFAULT_DARK, type Theme, type ThemeColors } from './palette'
import { OCEAN_THEME } from './ocean'
import { FOREST_THEME } from './forest'

/**
 * 平铺主题列表（用户心智：主题 = 整体外观方案——不做"深浅×配色"二维组合）
 *  - 浅色：固定浅色 + 默认蓝配色
 *  - 深色：固定深色 + 默认蓝配色
 *  - 海洋/森林：配色主题——跟随系统明暗（设备深色模式时自动用 dark 色板）
 */
export const THEMES: Theme[] = [
  { id: 'light', name: '浅色', description: '标准浅色（默认蓝）', scheme: 'light', swatch: '#ffffff', light: DEFAULT_LIGHT, dark: DEFAULT_LIGHT },
  { id: 'dark', name: '深色', description: '标准深色（默认蓝）', scheme: 'dark', swatch: '#1d1d1f', light: DEFAULT_DARK, dark: DEFAULT_DARK },
  OCEAN_THEME,
  FOREST_THEME,
]

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/** 解析主题当前生效的色板（按 scheme：固定浅/深 或 跟随系统） */
export function resolveColors(theme: Theme, systemDark: boolean): ThemeColors {
  if (theme.scheme === 'light') return theme.light
  if (theme.scheme === 'dark') return theme.dark
  return systemDark ? theme.dark : theme.light
}

/** 把色板注入 <html> 的 CSS 变量（覆盖 :root 默认值） */
export function applyColors(colors: ThemeColors): void {
  const root = document.documentElement
  for (const [key, value] of Object.entries(colors)) {
    root.style.setProperty(key, value)
  }
}
