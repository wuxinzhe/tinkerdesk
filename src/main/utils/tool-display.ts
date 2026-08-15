/**
 * tool-display.ts — Tool name display helpers (main side)
 *
 * Tool registration and LLM calls use prefixed full names
 * (e.g. desktop_tinker_terminal); UI-facing text shows the short name.
 * Format: {type}_{server}_{toolId} → toolId
 *   desktop_tinker_terminal → terminal
 *   mcp_filesystem_list_directory → list_directory
 * (mirrors the renderer copy in src/renderer/utils/tool-display.ts —
 * main/renderer are built separately, so the logic lives in both.)
 */

/** Strip the {type}_{server}_ prefix from a tool full name. */
export function getShortName(fullName: string): string {
  return fullName.replace(/^\w+_\w+_/, '')
}
