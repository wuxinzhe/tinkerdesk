/**
 * tool-name.ts — 工具显示名解析
 *
 * 命名规则：{来源}_{标识}_{functionName}
 *  - desktop_tinker_vision_recognize → Vision recognize
 *  - computer_use                   → Computer use（无前缀——_ → 空格 + 首字母大写）
 *  - memory                         → Memory（英文开头首字母大写）
 *  - tts/stt                        → TTS/STT（固定大写展示）
 */
export function parseDisplayName(name: string): string {
  // TTS/STT 类固定大写展示
  if (name === 'tts') return 'TTS'
  if (name === 'stt') return 'STT'
  // 去前缀：{来源}_{标识}_{functionName} → functionName（≥3 段才切——computer_use 等 2 段保持）
  const parts = name.split('_')
  let display = parts.length > 2 ? parts.slice(2).join('_') : name
  // _ → 空格 + 英文开头首字母大写
  display = display.replace(/_/g, ' ')
  if (/^[a-zA-Z]/.test(display)) {
    display = display.charAt(0).toUpperCase() + display.slice(1)
  }
  return display
}
