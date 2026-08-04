/**
 * store-types.ts — 工具 store 类型定义
 *
 * 从 src/stores/tools-store.ts 提取。
 * 注意：此 ToolEntry 与 src/defines/tools/types.ts 中的不同：
 * - source 不包含 'server'
 * - schema 为完整嵌套结构（非 unknown）
 */

export interface ToolEntry {
  id: string
  name: string
  description: string
  source: 'desktop' | 'extension'
  category: string
  extensionId?: string
  targetUrl?: string
  schema?: {
    type: 'function'
    function: {
      name: string
      description: string
      parameters: {
        type: 'object'
        properties: Record<string, unknown>
        required: string[]
      }
    }
  }
}
