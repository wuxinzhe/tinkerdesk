/**
 * ocean.ts — 示例新配色「海洋」
 *
 * 演示如何新增主题：完整实现 ThemePalette（light/dark 全量——类型约束）
 * 注册到 index.ts 的 THEMES 即可生效（设置页自动出现）。
 *
 * 设计：深海青蓝——accent 用青蓝系、深色 bg 用蓝黑底
 */

import type { Theme } from './palette'

export const OCEAN_THEME: Theme = {
  id: 'ocean',
  name: '海洋',
  description: '深海青蓝',
  scheme: 'system',
  light: {
    // accent 压深：white on accent ≥4.5（主按钮白字可读）
    '--tk-accent': '#067f9a',
    '--tk-accent-hover': '#066e85',
    '--tk-accent-active': '#055c70',
    '--tk-destructive': '#ff3b30',
    '--tk-success': '#34c759',
    '--tk-warning': '#ff9500',
    '--tk-text-primary': '#10262b',
    '--tk-text-secondary': '#3d5a61',
    '--tk-text-tertiary': '#7a9299',
    '--tk-text-quaternary': '#a8bcc1',
    '--tk-text-link': '#067f9a',
    '--tk-bg-primary': '#f7fbfc',
    '--tk-card-bg': '#ffffff',
    '--tk-bg-secondary': '#eaf4f6',
    '--tk-bg-tertiary': '#e0eef1',
    '--tk-bg-elevated': '#ffffff',
    '--tk-bg-glass': 'rgba(247, 251, 252, 0.55)',
    '--tk-glass-edge': 'rgba(6, 127, 154, 0.18)',
    '--tk-bg-bubble-assistant': '#dcebef',
    '--tk-bg-selected': 'rgba(6, 127, 154, 0.1)',
    '--tk-border': '#d3e4e8',
    '--tk-border-focus': '#067f9a',
    '--tk-border-error': '#ff3b30',
    '--tk-border-card': 'rgba(10, 50, 60, 0.08)',
    '--tk-overlay': 'rgba(8, 40, 48, 0.65)',
    '--tk-shadow-focus': '0 0 0 3px rgba(6, 127, 154, 0.18)',
    '--tk-shadow-error': '0 0 0 3px rgba(255, 59, 48, 0.15)',
    '--tk-shadow-hairline': '0 0.5px 0 rgba(8, 60, 70, 0.06)',
    '--tk-shadow-sm': '0 1px 3px rgba(8, 60, 70, 0.05)',
    '--tk-shadow-md': '0 4px 12px rgba(8, 60, 70, 0.09)',
    '--tk-shadow-card': '0 1px 2px rgba(8, 60, 70, 0.05), 0 4px 12px rgba(8, 60, 70, 0.05)',
    '--tk-shadow-card-hover': '0 2px 4px rgba(8, 60, 70, 0.06), 0 8px 20px rgba(8, 60, 70, 0.09)',
  },
  dark: {
    // accent 压深（深青——白字 3.93 可读）；text-link 保持亮青（深底链接可读）
    '--tk-accent': '#128bb0',
    '--tk-accent-hover': '#149ac2',
    '--tk-accent-active': '#0f7a9c',
    '--tk-destructive': '#ff453a',
    '--tk-success': '#32d74b',
    '--tk-warning': '#ff9f0a',
    '--tk-text-primary': '#e8f4f6',
    '--tk-text-secondary': '#9db6bd',
    '--tk-text-tertiary': '#7a8f96',
    '--tk-text-quaternary': '#5c7076',
    '--tk-text-link': '#2fd5f5',
    '--tk-bg-primary': '#0d1b1f',
    '--tk-card-bg': '#14262b',
    '--tk-bg-secondary': '#14262b',
    '--tk-bg-tertiary': '#1b3238',
    '--tk-bg-elevated': '#14262b',
    '--tk-bg-glass': 'rgba(13, 27, 31, 0.55)',
    '--tk-glass-edge': 'rgba(47, 213, 245, 0.2)',
    '--tk-bg-bubble-assistant': '#1b3238',
    '--tk-bg-selected': 'rgba(47, 213, 245, 0.22)',
    '--tk-border': '#2a444b',
    '--tk-border-focus': '#2fd5f5',
    '--tk-border-error': '#ff453a',
    '--tk-border-card': 'rgba(47, 213, 245, 0.14)',
    '--tk-overlay': 'rgba(2, 12, 15, 0.72)',
    '--tk-shadow-focus': '0 0 0 3px rgba(47, 213, 245, 0.3)',
    '--tk-shadow-error': '0 0 0 3px rgba(255, 69, 58, 0.3)',
    '--tk-shadow-hairline': '0 0.5px 0 rgba(255, 255, 255, 0.08)',
    '--tk-shadow-sm': '0 1px 3px rgba(0, 0, 0, 0.35)',
    '--tk-shadow-md': '0 4px 12px rgba(0, 0, 0, 0.45)',
    '--tk-shadow-card': '0 1px 2px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.35)',
    '--tk-shadow-card-hover': '0 2px 4px rgba(0, 0, 0, 0.35), 0 8px 20px rgba(0, 0, 0, 0.45)',
  },
}
