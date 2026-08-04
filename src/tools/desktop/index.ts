/**
 * tools/desktop/index.ts — 桌面工具类型定义重新导出
 *
 * 所有桌面工具通过 ./index 引用 BaseTool 及相关类型，
 * 实际定义位于 defines/tools/base-tool.ts。
 */
export { BaseTool } from '@/defines/tools/base-tool'
export type { ToolResult, AvailabilityResult, ToolSchema, ToolDefinition } from '@/defines/tools/base-tool'
