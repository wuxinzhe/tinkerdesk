import { type GlobalThemeOverrides } from 'naive-ui'

/**
 * Showing Ai — Naive UI 主题覆盖
 *
 * 映射：core-principles.md → naive-ui themeOverrides
 * 保持与 styles/variables.css 一致
 */
export const naiveThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: 'var(--tk-accent)',
    primaryColorHover: 'var(--tk-accent-hover)',
    primaryColorPressed: 'var(--tk-accent-active)',
    primaryColorSuppl: 'var(--tk-accent)',

    errorColor: 'var(--tk-destructive)',
    errorColorHover: '#ff453a',
    errorColorPressed: '#d70015',
    errorColorSuppl: 'var(--tk-destructive)',

    successColor: 'var(--tk-success)',
    warningColor: 'var(--tk-warning)',

    textColor1: 'var(--tk-text-primary)',
    textColor2: 'var(--tk-text-tertiary)',
    textColor3: 'var(--tk-text-quaternary)',

    bodyColor: '#ffffff',
    borderRadius: '8px',
    borderRadiusSmall: '6px',

    fontSize: '13px',
    fontSizeTiny: '11px',
    fontSizeSmall: '12px',
    fontSizeMedium: '13px',
    fontSizeLarge: '14px',
    fontSizeHuge: '15px',

    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"SF Pro Text"',
      '"Helvetica Neue"',
      'Helvetica',
      'Arial',
      'sans-serif',
    ].join(', '),

    fontFamilyMono: [
      '"SF Mono"',
      '"SFMono-Regular"',
      '"Menlo"',
      '"Consolas"',
      'monospace',
    ].join(', '),
  },

  Button: {
    borderRadiusMedium: '8px',
    textColor: '#ffffff',
    color: 'var(--tk-accent)',
    colorHover: 'var(--tk-accent-hover)',
    colorPressed: 'var(--tk-accent-active)',
    colorFocus: 'var(--tk-accent)',
    heightLarge: '44px',
    fontSizeLarge: '15px',
  },

  Input: {
    borderRadius: '6px',
    color: 'var(--tk-bg-secondary)',
    colorFocus: 'var(--tk-bg-secondary)',
    border: '1px solid var(--tk-border)',
    borderHover: '1px solid var(--tk-border)',
    borderFocus: '1px solid var(--tk-accent)',
    boxShadowFocus: '0 0 0 3px rgba(0, 122, 255, 0.15)',
    placeholderColor: 'var(--tk-text-quaternary)',
    textColor: 'var(--tk-text-primary)',
    heightMedium: '40px',
    fontSizeMedium: '14px',
    paddingMedium: '0 12px',
  },

  Form: {
    labelTextColor: 'var(--tk-text-primary)',
    labelFontWeight: '500',
    feedbackTextColorError: 'var(--tk-destructive)',
    blankHeightMedium: '40px',
  },

  Spin: {
    color: 'var(--tk-accent)',
  },
}

export default naiveThemeOverrides
