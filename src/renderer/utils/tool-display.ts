/**
 * tool-display.ts — 工具名称显示工具
 *
 * 工具注册和服务端通信使用带前缀的全名（如 desktop_tinker_terminal），
 * 但 UI 层只需要显示短名（如 "命令行"）。
 *
 * 如果工具定义有 readonly name（中文名），优先使用，
 * 否则从全名中剥离前缀。
 */

/**
 * 从带前缀的全名中提取简短的展示名。
 * 格式：{type}_{server}_{toolId} → toolId
 * 例如：desktop_tinker_terminal → terminal
 *       filesystem_list_directory → list_directory
 */
export function getShortName(fullName: string): string {
  return fullName.replace(/^\w+_\w+_/, '')
}

/**
 * 获取工具的 UI 显示名。
 * 优先使用工具定义中的中文名，否则用短名。
 */
export function getToolDisplayName(
  fullName?: string,
  displayName?: string
): string {
  if (displayName) return displayName
  if (fullName) return getShortName(fullName)
  return ''
}
