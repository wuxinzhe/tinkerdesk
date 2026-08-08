/**
 * tool-manager.ts — 工具管理器（统一工具注册中心）
 *
 * 复刻 tinker-agent ToolManager（本地版）：
 * - 启动注册：check 每个工具的可用性，仅缓存可用的 name → tool Map
 * - 工具类型：builtin（内建）/ client（对外）/ mcp（MCP 统一执行器）
 * - 工具执行：取出 tool 实例 → 按 toolType 路由——
 *     builtin / client → tool.execute(ctx)（工具自身执行器）
 *     mcp            → MCP 统一执行器（McpTool.execute 内部转发 mcpManager）
 *
 * 所有工具（内建/客户端/MCP）同构为 IAgentTool，注册在同一注册中心。
 * 路由依据 tool 实例的 toolType，不使用前缀判断。
 */
import type { ToolCall } from '../llm/types'
import type { ToolContext } from '../loop/types'
import { ToolResult } from './tool-result'
import { ToolSchema } from './tool-schema'
import type { AgentToolRegistration, IAgentTool, ToolType } from './types'
import { TOOL_TYPE_BUILTIN, TOOL_TYPE_CLIENT, TOOL_TYPE_MCP } from './types'

/** 工具管理器（统一工具注册中心） */
export class ToolManager {
  /** 工具池：toolName → IAgentTool（仅可用工具，内建/客户端/MCP 同构注册） */
  private readonly tools = new Map<string, IAgentTool>()

  /** 工具类型：toolName → toolType（builtin / mcp / client） */
  private readonly toolTypes = new Map<string, ToolType>()

  /** 禁用工具集合：profile → Set<toolName> */
  private readonly disabledTools = new Map<string, Set<string>>()

  /** 工具 emoji 元信息：toolName → emoji */
  private readonly toolEmojis = new Map<string, string>()

  /**
   * 构造：接收所有工具注册项（内建 + MCP + 客户端），逐个 check 可用性后按名称编入内存。
   * 重复名称抛错；不可用工具跳过（不入池）。
   */
  constructor(registrations: AgentToolRegistration[]) {
    for (const reg of registrations) {
      const toolName = reg.meta.name

      if (this.tools.has(toolName)) {
        throw new Error(`Duplicate tool name: ${toolName}`)
      }
      // check 可用性：未实现 check 视为可用
      const available = reg.tool.check ? reg.tool.check() : true
      if (!available) {
        console.warn(`[ToolManager] 工具不可用，跳过注册: ${toolName}`)
        continue
      }
      this.tools.set(toolName, reg.tool)
      this.toolEmojis.set(toolName, reg.meta.emoji ?? '⚡')
      // 工具类型分类（默认 builtin，注册时可覆盖）
      this.toolTypes.set(toolName, reg.meta.toolType ?? TOOL_TYPE_BUILTIN)

      // 工具类自身可覆写 emoji（通过 schema.setEmoji）
      const schema = reg.tool.getSchema()
      if (reg.meta.emoji) {
        schema.setEmoji(reg.meta.emoji)
      }
    }
  }

  /**
   * 动态注册工具（MCP 工具连接后调用）。
   * 重复名称：已存在则跳过（工具已注册）。
   */
  register(reg: AgentToolRegistration): void {
    const toolName = reg.meta.name
    if (this.tools.has(toolName)) {
      return
    }
    const available = reg.tool.check ? reg.tool.check() : true
    if (!available) {
      console.warn(`[ToolManager] 工具不可用，跳过注册: ${toolName}`)
      return
    }
    this.tools.set(toolName, reg.tool)
    this.toolEmojis.set(toolName, reg.meta.emoji ?? '⚡')
    this.toolTypes.set(toolName, reg.meta.toolType ?? TOOL_TYPE_BUILTIN)
    const schema = reg.tool.getSchema()
    if (reg.meta.emoji) {
      schema.setEmoji(reg.meta.emoji)
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

  /** 获取工具类型（builtin / mcp / client） */
  getToolType(toolName: string): ToolType | null {
    return this.toolTypes.get(toolName) ?? null
  }

  /** 获取全部工具类型映射（toolName → toolType） */
  getAllToolTypes(): Record<string, ToolType> {
    return Object.fromEntries(this.toolTypes)
  }

  /**
   * 获取客户端工具 Schema（toolType = client，注册到服务端用）。
   * 云端模式时，这些工具需要向 tinker-agent 服务端注册，
   * 服务端 TinkerAgent 调用时派发回本地执行。
   */
  getClientToolSchemas(profile: string): ToolSchema[] {
    const disabled = this.getDisabledSet(profile)
    const result: ToolSchema[] = []
    for (const [name, tool] of this.tools) {
      if (this.toolTypes.get(name) !== TOOL_TYPE_CLIENT) continue
      if (disabled.has(name)) continue
      result.push(tool.getSchema())
    }
    return result
  }

  /** 获取内建工具 Schema（toolType = builtin，本地 TinkerAgent 直接执行）。 */
  getBuiltinToolSchemas(profile: string): ToolSchema[] {
    const disabled = this.getDisabledSet(profile)
    const result: ToolSchema[] = []
    for (const [name, tool] of this.tools) {
      if (this.toolTypes.get(name) !== TOOL_TYPE_BUILTIN) continue
      if (disabled.has(name)) continue
      result.push(tool.getSchema())
    }
    return result
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

  /** 执行工具调用（builtin/client 走自身执行器；mcp 走 MCP 统一执行器） */
  async execute(ctx: ToolContext): Promise<ToolResult> {
    const toolName = ctx.toolCall.name
    const tool = this.tools.get(toolName)

    if (!tool) {
      return ToolResult.sync(`错误：工具 ${toolName} 不存在或不可用`)
    }

    const toolType = this.toolTypes.get(toolName)
    if (toolType === TOOL_TYPE_MCP) {
      // MCP 工具：McpTool.execute 内部转发给 MCP 统一执行器（mcpManager）
      return tool.execute(ctx)
    }

    // builtin / client：工具自身执行器
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
 * 解析带前缀的工具名，去掉 "{type}_tinker_" 前缀，返回原始名。
 * 例如 "desktop_tinker_my_tool" → "my_tool"；无前缀则原样返回。
 */
export function parseToolName(prefixedName: string): string {
  const parts = prefixedName.split('_', 3)
  if (parts.length < 3) {
    return prefixedName
  }
  return parts[2]
}
