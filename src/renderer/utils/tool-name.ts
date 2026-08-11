/**
 * tool-name.ts — 工具显示名解析
 *
 * 命名规则：{来源}_{标识}_{functionName}
 *  - builtin_tinker_terminal → Terminal
 *  - mcp_天气_fetch          → Fetch
 *  - desktop_tinker_vision_recognize → Vision recognize（去前缀后 _→空格）
 *  - memory                  → memory（≤2段保持原名）
 */
export function parseDisplayName(name: string): string {
  const parts = name.split('_')
  if (parts.length <= 2) {
    // 简短工具名保持原名——TTS/STT 类固定大写展示
    if (name === 'tts') return 'TTS'
    if (name === 'stt') return 'STT'
    return name
  }
  let display = parts.slice(2).join('_')
  // 去前缀后仍含 _ → 替换成空格（vision_recognize → vision recognize）
  display = display.replace(/_/g, ' ')
  // 英文开头 → 首字母大写（vision recognize → Vision recognize）
  if (/^[a-zA-Z]/.test(display)) {
    display = display.charAt(0).toUpperCase() + display.slice(1)
  }
  return display
}
