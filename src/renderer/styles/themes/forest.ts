/**
 * forest.ts — 主题「森林」
 *
 * 演示新增主题：完整实现 Theme（light/dark 全量——类型约束）
 * 注册到 index.ts 的 THEMES 即可生效（设置页自动出现）。
 *
 * 设计：森绿——accent 用苔绿系、深色 bg 用深墨绿底
 */

import type { Theme } from './palette'

export const FOREST_THEME: Theme = {
  id: 'forest',
  name: '森林',
  description: '森绿苔原',
  scheme: 'system',
  light: {
    // accent 压深：white on accent ≥4.5（主按钮白字可读）
    '--tk-accent': '#27734a',
    '--tk-accent-hover': '#22613f',
    '--tk-accent-active': '#1c5034',
    '--tk-destructive': '#ff3b30',
    '--tk-success': '#34c759',
    '--tk-warning': '#ff9500',
    '--tk-text-primary': '#1c2b22',
    '--tk-text-secondary': '#44584d',
    '--tk-text-tertiary': '#7d9186',
    '--tk-text-quaternary': '#a9bbb1',
    '--tk-text-link': '#27734a',
    '--tk-bg-primary': '#f8fbf9',
    '--tk-card-bg': '#ffffff',
    '--tk-bg-secondary': '#ecf3ee',
    '--tk-bg-tertiary': '#e2ede6',
    '--tk-bg-elevated': '#ffffff',
    '--tk-bg-glass': 'rgba(248, 251, 249, 0.55)',
    '--tk-glass-edge': 'rgba(39, 115, 74, 0.18)',
    '--tk-bg-bubble-assistant': '#dcebe2',
    '--tk-bg-selected': 'rgba(39, 115, 74, 0.1)',
    '--tk-border': '#d5e4db',
    '--tk-border-focus': '#27734a',
    '--tk-border-error': '#ff3b30',
    '--tk-border-card': 'rgba(20, 60, 40, 0.08)',
    '--tk-overlay': 'rgba(15, 45, 30, 0.65)',
    '--tk-shadow-focus': '0 0 0 3px rgba(39, 115, 74, 0.18)',
    '--tk-shadow-error': '0 0 0 3px rgba(255, 59, 48, 0.15)',
    '--tk-shadow-hairline': '0 0.5px 0 rgba(20, 70, 45, 0.06)',
    '--tk-shadow-sm': '0 1px 3px rgba(20, 70, 45, 0.05)',
    '--tk-shadow-md': '0 4px 12px rgba(20, 70, 45, 0.09)',
    '--tk-shadow-card': '0 1px 2px rgba(20, 70, 45, 0.05), 0 4px 12px rgba(20, 70, 45, 0.05)',
    '--tk-shadow-card-hover': '0 2px 4px rgba(20, 70, 45, 0.06), 0 8px 20px rgba(20, 70, 45, 0.09)',
  },
  dark: {
    // accent 压深（深绿——白字 4.32 可读）；text-link 保持亮绿（深底链接可读）
    '--tk-accent': '#1d8a60',
    '--tk-accent-hover': '#1f9e6b',
    '--tk-accent-active': '#176f4f',
    '--tk-destructive': '#ff453a',
    '--tk-success': '#32d74b',
    '--tk-warning': '#ff9f0a',
    '--tk-text-primary': '#e8f4ec',
    '--tk-text-secondary': '#9db6a6',
    '--tk-text-tertiary': '#7a9184',
    '--tk-text-quaternary': '#5c7065',
    '--tk-text-link': '#3ddc85',
    '--tk-bg-primary': '#0f1a13',
    '--tk-card-bg': '#16251b',
    '--tk-bg-secondary': '#16251b',
    '--tk-bg-tertiary': '#1d3025',
    '--tk-bg-elevated': '#16251b',
    '--tk-bg-glass': 'rgba(15, 26, 19, 0.55)',
    '--tk-glass-edge': 'rgba(61, 220, 133, 0.2)',
    '--tk-bg-bubble-assistant': '#1d3025',
    '--tk-bg-selected': 'rgba(61, 220, 133, 0.22)',
    '--tk-border': '#2a4434',
    '--tk-border-focus': '#3ddc85',
    '--tk-border-error': '#ff453a',
    '--tk-border-card': 'rgba(61, 220, 133, 0.14)',
    '--tk-overlay': 'rgba(4, 14, 8, 0.72)',
    '--tk-shadow-focus': '0 0 0 3px rgba(61, 220, 133, 0.3)',
    '--tk-shadow-error': '0 0 0 3px rgba(255, 69, 58, 0.3)',
    '--tk-shadow-hairline': '0 0.5px 0 rgba(255, 255, 255, 0.08)',
    '--tk-shadow-sm': '0 1px 3px rgba(0, 0, 0, 0.35)',
    '--tk-shadow-md': '0 4px 12px rgba(0, 0, 0, 0.45)',
    '--tk-shadow-card': '0 1px 2px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.35)',
    '--tk-shadow-card-hover': '0 2px 4px rgba(0, 0, 0, 0.35), 0 8px 20px rgba(0, 0, 0, 0.45)',
  },
}
