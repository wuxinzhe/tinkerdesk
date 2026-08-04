/**
 * base-tool.ts — 统一工具基类 + 类型定义
 *
 * 合并 main/tools/index.ts 的 BaseTool（桌面原生工具）
 * 和 renderer/tools/base-ui-tool.ts 的 BaseUiTool（UI 交互工具）。
 *
 * 区分点：
 *   - 桌面工具：execute 返回 Promise<ToolResult>，运行在 main 进程
 *   - UI 工具：execute 触发 UI 交互，通过 context.sendToolResult 回调返回结果
 *   - 扩展桥接工具：通过 ExternalToolBridge 注册，归 ToolRegistry 管理
 *
 * 所有工具统一对外暴露 getDefinition()，格式为 OpenAI Function Calling。
 */

// ── JSON Schema 属性描述（OpenAI 格式）──

interface JSONSchemaProperty {
  type: string | string[]
  description?: string
  enum?: string[]
  default?: unknown
  items?: JSONSchemaProperty
  properties?: Record<string, JSONSchemaProperty>
  required?: string[]
  [key: string]: unknown
}

/** LLM 工具 schema（OpenAI Function Calling 格式） */
export interface ToolSchema {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, JSONSchemaProperty>
      required: string[]
    }
  }
  /** 工具来源类型，仅客户端内部路由使用，不返回给大模型 */
  toolType?: string
  /** 工具图标 emoji */
  emoji?: string
}

/** 运行时可用性检测结果 */
export interface AvailabilityResult {
  available: boolean
  reason?: string
}

/** 桌面工具执行结果 */
export interface ToolResult {
  ok: boolean
  data?: unknown
  error?: string
}

/** 扩展桥接工具执行结果 */
export interface ToolBridgeResult {
  ok: boolean
  data?: string
  error?: string
}

/** 完整工具定义（含 schema），用于 IPC 传递或后端注册 */
export interface ToolDefinition {
  id: string
  name: string
  description: string
  category: string
  schema: ToolSchema
  serverName?: string
}

/** UI 工具执行上下文 */
export interface ToolExecutionContext {
  toolCallId: string
  sendToolResult: (toolCallId: string, result: string) => void
}

// ── 统一抽象基类 ──

export abstract class BaseTool<TParams = any> {
  /** 唯一工具 ID（也用作 schema function name） */
  abstract readonly id: string
  /** 显示名称 */
  abstract readonly name: string
  /** 工具说明（给 LLM 看） */
  abstract readonly description: string
  /** 工具分类 */
  abstract readonly category: string

  /** 工具来源类型，仅内部路由使用 */
  readonly toolType: string = 'desktop'
  /** 提供该工具的源标识，built-in 工具为 "showing" */
  readonly serverName: string = 'showing'

  /** LLM 工具 schema（OpenAI Function Calling 格式） */
  abstract getSchema(): ToolSchema

  /**
   * 运行时检测本机可用性。
   * 桌面工具：返回 Promise<AvailabilityResult>（异步检查文件权限、命令是否存在等）
   * UI 工具：返回 true（页面在工具就在）
   */
  checkAvailability(): Promise<AvailabilityResult> | AvailabilityResult {
    return { available: true }
  }

  /**
   * 执行工具。
   *
   * 桌面工具模式：返回 Promise<ToolResult>，fire-and-forget 直接拿到结果。
   * UI 工具模式：触发 UI 交互（如弹出表单），通过 context.sendToolResult 回调
   *             返回结果。execute() 返回 Promise<void>，在交互开始时 resolve。
   */
  abstract execute(
    params: TParams,
    context?: ToolExecutionContext
  ): Promise<ToolResult | void>

  /** 返回完整定义（含 schema），用于 IPC 传递或后端注册 */
  getDefinition(): ToolDefinition {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      schema: this.getSchema(),
      serverName: this.serverName
    }
  }
}
