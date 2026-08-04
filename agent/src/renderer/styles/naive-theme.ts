import { type GlobalThemeOverrides } from 'naive-ui'

/**
 * Showing Ai — Naive UI 主题覆盖
 *
 * 映射：core-principles.md → naive-ui themeOverrides
 * 保持与 styles/variables.css 一致
 */
export const naiveThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#007aff',
    primaryColorHover: '#0066d6',
    primaryColorPressed: '#004d99',
    primaryColorSuppl: '#007aff',

    errorColor: '#ff3b30',
    errorColorHover: '#ff453a',
    errorColorPressed: '#d70015',
    errorColorSuppl: '#ff3b30',

    successColor: '#34c759',
    warningColor: '#ff9500',

    textColor1: '#1d1d1f',
    textColor2: '#86868b',
    textColor3: '#aeaeb2',

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
    color: '#007aff',
    colorHover: '#0066d6',
    colorPressed: '#004d99',
    colorFocus: '#007aff',
    heightLarge: '44px',
    fontSizeLarge: '15px',
  },

  Input: {
    borderRadius: '6px',
    color: '#f5f5f7',
    colorFocus: '#f5f5f7',
    border: '1px solid #d2d2d7',
    borderHover: '1px solid #d2d2d7',
    borderFocus: '1px solid #007aff',
    boxShadowFocus: '0 0 0 3px rgba(0, 122, 255, 0.15)',
    placeholderColor: '#aeaeb2',
    textColor: '#1d1d1f',
    heightMedium: '40px',
    fontSizeMedium: '14px',
    paddingMedium: '0 12px',
  },

  Form: {
    labelTextColor: '#1d1d1f',
    labelFontWeight: '500',
    feedbackTextColorError: '#ff3b30',
    blankHeightMedium: '40px',
  },

  Spin: {
    color: '#007aff',
  },
}

export default naiveThemeOverrides
