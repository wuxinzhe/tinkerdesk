/**
 * tool-manager.ts — Tool manager (unified tool registry)
 *
 * ToolManager (local):
 * - startup registration: checks each tool's availability, caches only the
 *   available name → tool map
 * - tool kinds: builtin (built-in) / client (external-facing) / desktop (local)
 * - 工具执行：取出 tool 实例 → 按 toolType 路由——
 *     builtin / client → tool.execute(ctx)（工具自身执行器）
 *     builtin        → 所有代码内置工具（tools/ 根，不再区分 desktop）
 *
 * 所有工具（内建/客户端/桌面）同构为 IAgentTool，注册在同一注册中心。
 * 路由依据 tool 实例的 toolType，不使用前缀判断。
 */
import type { ToolCall } from '../llm/types'
import type { ToolContext } from '../loop/types'
import { ToolResult } from './tool-result'
import { ToolSchema } from './tool-schema'
import type { AgentToolRegistration, IAgentTool } from './types'

/** 工具管理器（统一工具注册中心） */
export class ToolManager {
  /** 工具池：toolName → IAgentTool（仅可用工具，内建/桌面/客户端同构注册） */
  private readonly tools = new Map<string, IAgentTool>()

  /** 工具注册来源：toolName → 'builtin'（框架内置）| 'external'（外置安装） */
  private readonly toolSources = new Map<string, string>()
  /** 不可用工具（check 失败——列表展示灰色 + 管理页错误原因）：toolName → { schema, reason } */
  private readonly unavailableTools = new Map<string, { schema: ToolSchema; reason: string }>()

  /** 禁用工具集合：profile → Set<toolName> */
  private readonly disabledTools = new Map<string, Set<string>>()

  /**
   * per-agent 工具集白名单：profile → 允许的工具名集合。
   * 未设置 = 全量（该 profile 可见全局工具池全部工具——兼容 default 模式）。由 bootstrap 按
   * 该 profile 的 AgentMode.getToolset() 注入——受限 Agent（如管家）白名单不含外部工具 → 天然隔离。
   */

  /** 工具 emoji 元信息：toolName → emoji */
  private readonly toolEmojis = new Map<string, string>()

  /** 统一 schema 出口：优先动态 getToolSchema()（环境感知）——兜底静态 getSchema() */
  private getEffectiveSchema(tool: IAgentTool): ToolSchema {
    return tool.getToolSchema?.() ?? tool.getSchema()
  }

  /**
   * 构造：接收所有内置工具注册项（内建 + 桌面 + 客户端），逐 check 可用性后编入内存。
   * 重复名称抛错；不可用工具跳过（不入池）。ToolCenter 启动注册也走 registerAll。
   */
  constructor(registrations: AgentToolRegistration[] = []) {
    this.registerAll(registrations)
  }

  /** 批量注册（内建/桌面/外置 统一入口）——逐 check 可用性，不可用记录原因不入池 */
  registerAll(registrations: AgentToolRegistration[]): void {
    for (const reg of registrations) {
      const toolName = reg.meta.name

      if (this.tools.has(toolName)) {
        throw new Error(`Duplicate tool name: ${toolName}`)
      }
      // check 可用性：未实现 check 视为可用——失败记录原因（列表展示灰色 + 管理页错误信息）
      const checkResult = reg.tool.check ? reg.tool.check() : true
      const available = typeof checkResult === 'object' && 'ok' in checkResult ? checkResult.ok : (checkResult as boolean)
      if (!available) {
        const reason = typeof checkResult === 'object' && 'ok' in checkResult && checkResult.reason
          ? checkResult.reason
          : '工具不可用（未通过可用性检测）'
        console.warn(`[ToolManager] 工具不可用，跳过注册: ${toolName}（${reason}）`)
        // 保留展示信息（管理页列表显示灰色 + 错误原因）
        const schema = this.getEffectiveSchema(reg.tool)
        if (reg.meta.emoji) schema.setEmoji(reg.meta.emoji)
        this.unavailableTools.set(toolName, { schema, reason })
        continue
      }
      this.tools.set(toolName, reg.tool)
      this.toolEmojis.set(toolName, reg.meta.emoji ?? '⚡')
      // 工具类型分类（默认 builtin，注册时可覆盖）

      // 工具类自身可覆写 emoji（通过 schema.setEmoji）
      const schema = this.getEffectiveSchema(reg.tool)
      if (reg.meta.emoji) {
        schema.setEmoji(reg.meta.emoji)
      }
    }
  }

  /**
   * 动态注册工具（插件工具安装后调用）。
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
    this.toolSources.set(toolName, reg.source ?? 'builtin')
    const schema = this.getEffectiveSchema(reg.tool)
    if (reg.meta.emoji) {
      schema.setEmoji(reg.meta.emoji)
    }
  }

  /**
   * 反注册工具（卸载/移除——ToolCenter 卸载工具包时调用）。
   */
  unregister(toolName: string): void {
    this.tools.delete(toolName)
    this.toolEmojis.delete(toolName)
  }

  // ════════════════════════════════════════════════════════════
  // 工具查询
  // ════════════════════════════════════════════════════════════

  /** 获取全部工具 Schema（含禁用 + 不可用——用于管理界面） */
  getAllSchemas(): ToolSchema[] {
    const result: ToolSchema[] = []
    for (const tool of this.tools.values()) {
      result.push(this.getEffectiveSchema(tool))
    }
    for (const { schema } of this.unavailableTools.values()) {
      result.push(schema)
    }
    return result
  }

  /** 工具不可用原因：toolName → reason（管理页 tps-tool-error 展示） */
  getToolErrors(): Map<string, string> {
    const map = new Map<string, string>()
    for (const [name, { reason }] of this.unavailableTools) {
      map.set(name, reason)
    }
    return map
  }

  /** 白名单解析：authorized（DB 授权）优先 → 回落注入的 profile 默认 → 无记录 = 全量 */
  private resolveAllowSet(profile: string, authorized?: string[] | null): Set<string> | null {
    if (authorized && authorized.length > 0) return new Set(authorized)
    return null
  }

  /** 获取工具 Schema（authorized 白名单过滤——authorized null 未提供则全量） */
  getAvailableSchemas(profile: string, authorized?: string[] | null): ToolSchema[] {
    const allow = this.resolveAllowSet(profile, authorized)
    const result: ToolSchema[] = []

    for (const [internalName, tool] of this.tools) {
      if (allow && !allow.has(internalName)) continue
      result.push(this.getEffectiveSchema(tool))
    }
    return result
  }

  /** 获取工具名列表（authorized 白名单过滤——authorized null 未提供则全量） */
  getAvailableToolNames(profile: string, authorized?: string[] | null): string[] {
    const allow = this.resolveAllowSet(profile, authorized)
    return [...this.tools.keys()].filter((n) => !allow || allow.has(n))
  }

  /** 全部已注册工具名（模式 getToolset 取全量用——含内置 + 外置安装） */
  getAllToolNames(): string[] {
    return [...this.tools.keys()]
  }


  /** 获取指定注册来源的工具名列表（缺省 = 内置 builtin——排除外置 external） */
  getToolNamesOfSources(sources?: string[]): string[] {
    const allow = sources ?? ['builtin']
    return [...this.tools.keys()].filter((n) => allow.includes(this.toolSources.get(n) ?? 'builtin'))
  }

  /** 获取工具注册来源（内置 builtin / 外置 external——缺省内置） */
  getToolSource(name: string): 'builtin' | 'external' {
    return (this.toolSources.get(name) as 'builtin' | 'external') ?? 'builtin'
  }

  /** 根据工具名获取完整 ToolSchema（未找到返回 null） */
  getToolSchema(toolName: string): ToolSchema | null {
    const tool = this.tools.get(toolName)
    return tool ? this.getEffectiveSchema(tool) : null
  }


  // ════════════════════════════════════════════════════════════
  // per-agent 工具集白名单（按 AgentMode.getToolset 注入）
  // ════════════════════════════════════════════════════════════

  // ════════════════════════════════════════════════════════════
  // 禁用工具配置（本地 Map）
  // ════════════════════════════════════════════════════════════

  // ════════════════════════════════════════════════════════════
  // 工具执行
  // ════════════════════════════════════════════════════════════

  /** execute 兜底：当前 Agent 是否允许调某工具——优先用本周期已装配的 ctx.toolNames（DB/mode 白名单） */
  private isToolAllowedFor(ctx: ToolContext, toolName: string): boolean {
    // 白名单兜底：以本周期装配的 ctx.toolNames（mode 决定的工具集）为准；未装配则放行
    if (ctx.toolNames && ctx.toolNames.length > 0) {
      return ctx.toolNames.includes(toolName)
    }
    return true
  }

  /** 执行工具调用（builtin/client/desktop 走各自执行器） */
  async execute(ctx: ToolContext): Promise<ToolResult> {
    const toolName = ctx.toolCall.name

    // per-agent 白名单兜底：受限 Agent 调白名单外工具 → 拒绝
    //（装配层只是"列表不可见"，执行层才是真正防线——防 LLM 绕过 schema 列表硬调白名单外工具）
    if (!this.isToolAllowedFor(ctx, toolName)) {
      return ToolResult.sync(`错误：工具 ${toolName} 不在当前 Agent 的可用工具范围内`)
    }

    const tool = this.tools.get(toolName)

    if (!tool) {
      return ToolResult.sync(`错误：工具 ${toolName} 不存在或不可用`)
    }

    // 统一执行器（不再按 toolType 路由——全部走工具自身 execute）
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
