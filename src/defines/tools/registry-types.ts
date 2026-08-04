/**
 * registry-types.ts — 工具注册中心类型定义
 *
 * 从 src/services/registry/tool-registry.ts 提取。
 * 被 tool-registry.ts（服务层）使用。
 */

import type { ToolSchema } from '@/defines/tools/base-tool'

/** 外部传入的桌面工具元数据（从主进程通过 IPC 获取） */
export interface DesktopToolMeta {
  id: string
  name: string
  description: string
  category: string
  schema: ToolSchema
}
