/**
 * tool-manager.ts — 工具管理器（本地工具版）
 *
 * 复刻 showing-agent ToolManager 的本地化简化版：
 * - 启动注册：收集所有本地 IAgentTool，按名称编入内存映射
 * - 工具查询：getAllSchemas / getAvailableSchemas / getAvailableToolNames
 * - 工具执行：直接查本地工具池执行
 *
 * 本地桌面应用：所有工具统一为本地工具（在 Electron 主进程执行），
 * 无服务端/客户端区分，无 Redis。
 */
import type {AgentToolRegistration, IAgentTool, ToolExecutionContext} from './types'
import {ToolResult} from './tool-result'
import {ToolSchema} from './tool-schema'
import type {ToolCall} from '../../defines/models/message'

/** 工具管理器（本地工具版） */
export class ToolManager {
  /** 本地工具池：toolName → IAgentTool */
  private readonly tools = new Map<string, IAgentTool>()

  /** 禁用工具集合：profile → Set<toolName> */
  private readonly disabledTools = new Map<string, Set<string>>()

  /** 工具 emoji 元信息：toolName → emoji */
  private readonly toolEmojis = new Map<string, string>()

  /**
   * 构造：接收所有工具注册项，按名称编入内存。
   * 重复名称抛错。
   */
  constructor(registrations: AgentToolRegistration[]) {
    for (const reg of registrations) {
      const toolName = reg.meta.name

      if (this.tools.has(toolName)) {
        throw new Error(`Duplicate tool name: ${toolName}`)
      }
      this.tools.set(toolName, reg.tool)
      this.toolEmojis.set(toolName, reg.meta.emoji ?? '⚡')

      // 工具类自身可覆写 emoji（通过 schema.setEmoji）
      const schema = reg.tool.getSchema()
      if (reg.meta.emoji) {
        schema.setEmoji(reg.meta.emoji)
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // 工具查询
  // ════════════════════════════════════════════════════════════

  /** 获取全部工具 Schema（含禁用，用于管理界面） */
  getAllSchemas(): ToolSchema[] {
    const result: ToolSchema[] = []
    for (const tool of this.tools.values()) {
      result.push(tool.getSchema())
    }
    return result
  }

  /** 获取可用工具 Schema（排除禁用） */
  getAvailableSchemas(profile: string): ToolSchema[] {
    const disabled = this.getDisabledSet(profile)
    const result: ToolSchema[] = []

    for (const [internalName, tool] of this.tools) {
      const schema = tool.getSchema()
      if (!disabled.has(internalName) && !disabled.has(schema.name)) {
        result.push(schema)
      }
    }
    return result
  }

  /** 获取可用工具名列表（排除禁用） */
  getAvailableToolNames(profile: string): string[] {
    const disabled = this.getDisabledSet(profile)
    const names: string[] = []

    for (const internalName of this.tools.keys()) {
      if (!disabled.has(internalName)) {
        names.push(internalName)
      }
    }
    return names
  }

  /** 根据工具名获取完整 ToolSchema（未找到返回 null） */
  getToolSchema(toolName: string): ToolSchema | null {
    const tool = this.tools.get(toolName)
    return tool ? tool.getSchema() : null
  }

  // ════════════════════════════════════════════════════════════
  // 禁用工具配置（本地 Map）
  // ════════════════════════════════════════════════════════════

  getDisabledTools(profile: string): string[] {
    return [...this.getDisabledSet(profile)]
  }

  disableTool(profile: string, toolName: string): void {
    this.getDisabledSet(profile).add(toolName)
  }

  enableTool(profile: string, toolName: string): void {
    this.getDisabledSet(profile).delete(toolName)
  }

  private getDisabledSet(profile: string): Set<string> {
    const key = `${profile}`
    let set = this.disabledTools.get(key)
    if (!set) {
      set = new Set<string>()
      this.disabledTools.set(key, set)
    }
    return set
  }

  // ════════════════════════════════════════════════════════════
  // 工具执行
  // ════════════════════════════════════════════════════════════

  /** 执行工具调用（本地直接执行） */
  async execute(ctx: ToolExecutionContext): Promise<ToolResult> {
    const toolName = ctx.toolCall.name
    const tool = this.tools.get(toolName)

    if (!tool) {
      return ToolResult.sync(`错误：工具 ${toolName} 不存在或不可用`)
    }

    return tool.execute(ctx)
  }

  // ════════════════════════════════════════════════════════════
  // 工具进度消息
  // ════════════════════════════════════════════════════════════

  /** 构造工具执行进度提示文案：{emoji} {name}... */
  buildProgressMessage(tool: ToolCall): string {
    const name = tool.name
    const emoji = this.toolEmojis.get(name) ?? '⚡'
    return `${emoji} 正在调用 ${parseToolName(name)} 工具...`
  }
}

/**
 * 解析带前缀的工具名，去掉 "{type}_showing_" 前缀，返回原始名。
 * 例如 "desktop_showing_my_tool" → "my_tool"；无前缀则原样返回。
 */
export function parseToolName(prefixedName: string): string {
  const parts = prefixedName.split('_', 3)
  if (parts.length < 3) {
    return prefixedName
  }
  return parts[2]
}
