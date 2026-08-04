/**
 * bridge.ts — 外部工具桥接接口
 *
 * 供 Chrome Extension、原生插件等第三方工具源通过注入方式
 * 向 Agent 注册工具 schema 和处理逻辑。
 *
 * 实现此接口的对象通过 `ToolRegistry.registerBridge()` 注册，
 * 注册后其提供的工具自动进入 LLM 工具列表。
 */
export type {
  ExternalToolBridge,
  ToolSchema,
  ToolBridgeResult,
} from '@/defines/tools/bridge-types'

/**
 * 工具显示名解析：用 "_" 分割，去掉前两段，剩下的重新用 "_" 连接。
 *
 * 命名规则：{来源}_{标识}_{functionName}
 *  - desktop_showing_terminal → terminal
 *  - web_showing_clarify      → clarify
 *  - mcp-ext_天气_fetch       → fetch
 *  - memory                   → memory（≤2段保持原名）
 *  - session_search           → session_search（≤2段保持原名）
 */
export function parseDisplayName(name: string): string {
  const parts = name.split('_')
  if (parts.length <= 2) return name
  return parts.slice(2).join('_')
}
