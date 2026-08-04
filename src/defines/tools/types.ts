/**
 * types.ts — 工具数据类型（重新导出）
 *
 * 规范类型定义见 base-tool.ts，此文件仅保留
 * 服务端交互相关的 DTO 类型和重导出口。
 */

import type { ToolDefinition } from './base-tool'

// 服务端工具列表返回项
export interface ToolItem {
  name: string
  description: string
  disabled: boolean
  toolType: string
}

export interface ToolCategory {
  id: string
  name: string
  tools: ToolDefinition[]
}

export interface ToolEntry {
  id: string
  name: string
  description: string
  source: 'desktop' | 'extension' | 'server'
  category: string
  extensionId?: string
  targetUrl?: string
  schema?: unknown
}

export type {
  ToolSchema,
  ToolDefinition,
  ToolResult,
  AvailabilityResult,
  ToolBridgeResult,
  ToolExecutionContext,
  BaseTool
} from './base-tool'
