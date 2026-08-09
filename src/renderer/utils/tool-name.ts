/**
 * tool-name.ts — 工具显示名解析
 *
 * 命名规则：{来源}_{标识}_{functionName}
 *  - builtin_tinker_terminal → terminal
 *  - mcp_天气_fetch          → fetch
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
  return parts.slice(2).join('_')
}
