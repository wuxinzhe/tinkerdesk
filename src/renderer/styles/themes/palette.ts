/**
 * palette.ts — 主题模板（核心）
 *
 * ═══ 设计 ═══
 * 主题是「平铺的独立方案」：浅色 / 深色 / 海洋 / 森林…… 并列，
 * 每个主题自带配色 + 明暗策略（scheme）——用户一键选择整体，不做二维组合。
 *
 * 1. ThemeColors 以「CSS 变量名」为键——类型联合约束——每套配色必须提供全部键
 *    （漏一个 → 编译报错——模板的强约束）
 * 2. Theme = id/名称/描述 + scheme + light/dark 色板
 *    scheme: 'light' 固定浅色（浅色主题）| 'dark' 固定深色（深色主题）
 *            | 'system' 跟随系统明暗（海洋/森林等配色主题）
 * 3. theme.ts 运行时把选中色板注入 <html> 的 CSS 变量（组件引用 var(--tk-*) 零改动）
 *
 * ═══ 新增主题 ═══
 * 1. 新建 src/renderer/styles/themes/<name>.ts，实现 Theme（light/dark 齐全）
 * 2. 在 themes/index.ts 注册（设置页自动出现、全站生效）
 *
 * ═══ 说明 ═══
 * - 结构令牌（radius/spacing/motion/font/z-index）不属于配色——在 variables.css
 * - 变量前缀 --tk-*（TinkerDesk——全站组件统一引用）
 */

/** 配色键全集（= 注入到 <html> 的 CSS 变量名）——每个主题必须全量提供 */
export type ThemeColorKey =
  | '--tk-accent' | '--tk-accent-hover' | '--tk-accent-active'
  | '--tk-destructive' | '--tk-success' | '--tk-warning'
  | '--tk-text-primary' | '--tk-text-secondary' | '--tk-text-tertiary' | '--tk-text-quaternary' | '--tk-text-link'
  | '--tk-bg-primary' | '--tk-card-bg' | '--tk-bg-secondary' | '--tk-bg-tertiary' | '--tk-bg-elevated'
  | '--tk-bg-glass' | '--tk-glass-edge' | '--tk-bg-bubble-assistant' | '--tk-bg-selected'
  | '--tk-border' | '--tk-border-focus' | '--tk-border-error' | '--tk-border-card'
  | '--tk-overlay'
  | '--tk-shadow-focus' | '--tk-shadow-error' | '--tk-shadow-hairline' | '--tk-shadow-sm' | '--tk-shadow-md' | '--tk-shadow-card' | '--tk-shadow-card-hover'

export type ThemeColors = Record<ThemeColorKey, string>

export type ThemeScheme = 'light' | 'dark' | 'system'

export interface Theme {
  id: string
  name: string
  description?: string
  /** 明暗策略：light 固定浅色 / dark 固定深色 / system 跟随系统（取 light/dark 两套） */
  scheme: ThemeScheme
  /** 设置页色板圆点颜色（默认取 light accent）——浅色主题=白、深色主题=黑 */
  swatch?: string
  light: ThemeColors
  dark: ThemeColors
}

/** 基础色板（默认蓝——Apple HIG 语义色；浅色/深色主题直接使用） */
export const DEFAULT_LIGHT: ThemeColors = {
  '--tk-accent': '#007aff',
  '--tk-accent-hover': '#0066d6',
  '--tk-accent-active': '#004d99',
  '--tk-destructive': '#ff3b30',
  '--tk-success': '#34c759',
  '--tk-warning': '#ff9500',
  '--tk-text-primary': '#1d1d1f',
  '--tk-text-secondary': '#48484a',
  '--tk-text-tertiary': '#86868b',
  '--tk-text-quaternary': '#aeaeb2',
  '--tk-text-link': '#007aff',
  '--tk-bg-primary': '#ffffff',
  '--tk-card-bg': '#ffffff',
  '--tk-bg-secondary': '#f5f5f7',
  '--tk-bg-tertiary': '#f2f2f7',
  '--tk-bg-elevated': '#ffffff',
  '--tk-bg-glass': 'rgba(255, 255, 255, 0.55)',
  '--tk-glass-edge': 'rgba(255, 255, 255, 0.5)',
  '--tk-bg-bubble-assistant': '#e0e0e5',
  '--tk-bg-selected': 'rgba(0, 122, 255, 0.08)',
  '--tk-border': '#e8e8ed',
  '--tk-border-focus': '#007aff',
  '--tk-border-error': '#ff3b30',
  '--tk-border-card': 'rgba(0, 0, 0, 0.06)',
  '--tk-overlay': 'rgba(0, 0, 0, 0.65)',
  '--tk-shadow-focus': '0 0 0 3px rgba(0, 122, 255, 0.15)',
  '--tk-shadow-error': '0 0 0 3px rgba(255, 59, 48, 0.15)',
  '--tk-shadow-hairline': '0 0.5px 0 rgba(0, 0, 0, 0.06)',
  '--tk-shadow-sm': '0 1px 3px rgba(0, 0, 0, 0.04)',
  '--tk-shadow-md': '0 4px 12px rgba(0, 0, 0, 0.08)',
  '--tk-shadow-card': '0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.04)',
  '--tk-shadow-card-hover': '0 2px 4px rgba(0, 0, 0, 0.05), 0 8px 20px rgba(0, 0, 0, 0.07)',
}

export const DEFAULT_DARK: ThemeColors = {
  '--tk-accent': '#0a84ff',
  '--tk-accent-hover': '#2d95ff',
  '--tk-accent-active': '#5ab0ff',
  '--tk-destructive': '#ff453a',
  '--tk-success': '#32d74b',
  '--tk-warning': '#ff9f0a',
  '--tk-text-primary': '#f5f5f7',
  '--tk-text-secondary': '#a1a1a6',
  '--tk-text-tertiary': '#98989d',
  '--tk-text-quaternary': '#6e6e73',
  '--tk-text-link': '#0a84ff',
  '--tk-bg-primary': '#1e1e1e',
  '--tk-card-bg': '#2c2c2e',
  '--tk-bg-secondary': '#2c2c2e',
  '--tk-bg-tertiary': '#3a3a3c',
  '--tk-bg-elevated': '#2c2c2e',
  '--tk-bg-glass': 'rgba(28, 28, 34, 0.55)',
  '--tk-glass-edge': 'rgba(255, 255, 255, 0.12)',
  '--tk-bg-bubble-assistant': '#3a3a3c',
  '--tk-bg-selected': 'rgba(10, 132, 255, 0.2)',
  '--tk-border': '#48484a',
  '--tk-border-focus': '#0a84ff',
  '--tk-border-error': '#ff453a',
  '--tk-border-card': 'rgba(255, 255, 255, 0.12)',
  '--tk-overlay': 'rgba(0, 0, 0, 0.72)',
  '--tk-shadow-focus': '0 0 0 3px rgba(10, 132, 255, 0.3)',
  '--tk-shadow-error': '0 0 0 3px rgba(255, 69, 58, 0.3)',
  '--tk-shadow-hairline': '0 0.5px 0 rgba(255, 255, 255, 0.08)',
  '--tk-shadow-sm': '0 1px 3px rgba(0, 0, 0, 0.3)',
  '--tk-shadow-md': '0 4px 12px rgba(0, 0, 0, 0.4)',
  '--tk-shadow-card': '0 1px 2px rgba(0, 0, 0, 0.25), 0 4px 12px rgba(0, 0, 0, 0.3)',
  '--tk-shadow-card-hover': '0 2px 4px rgba(0, 0, 0, 0.3), 0 8px 20px rgba(0, 0, 0, 0.4)',
}
