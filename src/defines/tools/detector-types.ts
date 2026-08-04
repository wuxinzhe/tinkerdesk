/**
 * detector-types.ts — 桌面工具检测器类型定义
 *
 * 从 src/main/tool-detector.ts 提取。
 * 注意：此 DesktopToolDef 与 src/defines/api/backend-types.ts 中的不同：
 * - 此处的 source 固定为 'desktop'（literal 类型）
 * - schema 类型为 ToolSchema（非可选复杂嵌套对象）
 */

import type { ToolSchema } from '@/defines/tools/base-tool'

export interface DesktopToolDef {
  id: string
  name: string
  description: string
  source: 'desktop'
  category: string
  schema: ToolSchema
}
