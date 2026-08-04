/**
 * bridge-types.ts — 外部工具桥接类型定义
 *
 * 从 src/tools/ui/bridge.ts 提取。
 * 注意：此文件中的 ToolSchema 与 base-tool.ts 中的 ToolSchema 不同，
 * 前者为轻量 schema（name/description/parameters/toolType），
 * 后者为 OpenAI Function Calling 格式。
 */

export interface ExternalToolBridge {
  /** 桥接器标识（调试和日志用） */
  readonly name: string

  /**
   * 桥接器提供的工具 schema 列表。
   * 注册后自动合并到 `REGISTER_TOOLS` 发给后端。
   */
  getSchemas(): ToolSchema[]

  /**
   * 执行桥接器提供的工具。
   * @param toolCallId 原始 toolCall id（回 TOOL_RESULT 时要用）
   * @param name 工具名
   * @param args 工具参数
   */
  execute(toolCallId: string, name: string, args: Record<string, unknown>): Promise<ToolBridgeResult>
}

export interface ToolSchema {
  name: string
  description: string
  parameters?: Record<string, unknown>
  /** 工具来源类型，仅内部路由使用，不返回给大模型 */
  toolType?: string
}

export interface ToolBridgeResult {
  ok: boolean
  data?: string
  error?: string
}
