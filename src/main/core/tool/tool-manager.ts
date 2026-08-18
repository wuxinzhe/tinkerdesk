/**
 * tool-manager.ts — Tool manager (unified tool registry)
 *
 * ToolManager (local):
 * - startup registration: checks each tool's availability, caches only the
 *   available name → tool map
 * - tool kinds: builtin (built-in) / client (external-facing) / desktop (local)
 * - 工具执行：取出 tool 实例 → 按 toolType 路由——
 *     builtin / client → tool.execute(ctx)（工具自身执行器）
 *     desktop        → 客户端本地工具（tools/desktop）
 *
 * 所有工具（内建/客户端/桌面）同构为 IAgentTool，注册在同一注册中心。
 * 路由依据 tool 实例的 toolType，不使用前缀判断。
 */
import type { ToolCall } from '../llm/types'
import type { ToolContext } from '../loop/types'
import { ToolResult } from './tool-result'
import { ToolSchema } from './tool-schema'
import type { AgentToolRegistration, IAgentTool, ToolType } from './types'
import { TOOL_TYPE_BUILTIN, TOOL_TYPE_CLIENT } from './types'

/** 工具管理器（统一工具注册中心） */
export class ToolManager {
  /** 工具池：toolName → IAgentTool（仅可用工具，内建/桌面/客户端同构注册） */
  private readonly tools = new Map<string, IAgentTool>()

  /** 工具类型：toolName → toolType（builtin / desktop / client） */
  private readonly toolTypes = new Map<string, ToolType>()
  /** 不可用工具（check 失败——列表展示灰色 + 管理页错误原因）：toolName → { schema, reason } */
  private readonly unavailableTools = new Map<string, { schema: ToolSchema; reason: string }>()

  /** 禁用工具集合：profile → Set<toolName> */
  private readonly disabledTools = new Map<string, Set<string>>()

  /**
   * per-agent 工具集白名单：profile → 允许的工具名集合。
   * 未设置 = 全量（该 profile 可见全局工具池全部工具——兼容 default 模式）。由 bootstrap 按
   * 该 profile 的 AgentMode.getToolset() 注入——受限 Agent（如管家）白名单不含外部工具 → 天然隔离。
   */
  private readonly profileToolsets = new Map<string, Set<string>>()

  /** 工具 emoji 元信息：toolName → emoji */
  private readonly toolEmojis = new Map<string, string>()

  /** 统一 schema 出口：优先动态 getToolSchema()（环境感知）——兜底静态 getSchema() */
  private getEffectiveSchema(tool: IAgentTool): ToolSchema {
    return tool.getToolSchema?.() ?? tool.getSchema()
  }

  /**
   * 构造：接收所有工具注册项（内建 + 桌面 + 客户端），逐个 check 可用性后按名称编入内存。
   * 重复名称抛错；不可用工具跳过（不入池）。
   */
  constructor(registrations: AgentToolRegistration[]) {
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
        schema.toolType = reg.meta.toolType ?? TOOL_TYPE_BUILTIN
        this.unavailableTools.set(toolName, { schema, reason })
        continue
      }
      this.tools.set(toolName, reg.tool)
      this.toolEmojis.set(toolName, reg.meta.emoji ?? '⚡')
      // 工具类型分类（默认 builtin，注册时可覆盖）
      this.toolTypes.set(toolName, reg.meta.toolType ?? TOOL_TYPE_BUILTIN)

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
    this.toolTypes.set(toolName, reg.meta.toolType ?? TOOL_TYPE_BUILTIN)
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
    this.toolTypes.delete(toolName)
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
    const injected = this.profileToolsets.get(profile)
    if (injected) return injected
    return null
  }

  /** 获取可用工具 Schema（排除禁用 + 白名单——authorized 或注入默认） */
  getAvailableSchemas(profile: string, authorized?: string[] | null): ToolSchema[] {
    const disabled = this.getDisabledSet(profile)
    const allow = this.resolveAllowSet(profile, authorized)
    const result: ToolSchema[] = []

    for (const [internalName, tool] of this.tools) {
      if (allow && !allow.has(internalName)) continue
      const schema = this.getEffectiveSchema(tool)
      if (!disabled.has(internalName) && !disabled.has(schema.name)) {
        result.push(schema)
      }
    }
    return result
  }

  /** 获取可用工具名列表（排除禁用 + 白名单——authorized 或注入默认） */
  getAvailableToolNames(profile: string, authorized?: string[] | null): string[] {
    const disabled = this.getDisabledSet(profile)
    const allow = this.resolveAllowSet(profile, authorized)
    const names: string[] = []

    for (const internalName of this.tools.keys()) {
      if (!allow || allow.has(internalName)) {
        names.push(internalName)
      }
    }
    // 与禁用取并——放在 allow 过滤之后
    return names.filter((n) => !disabled.has(n))
  }

  /** 根据工具名获取完整 ToolSchema（未找到返回 null） */
  getToolSchema(toolName: string): ToolSchema | null {
    const tool = this.tools.get(toolName)
    return tool ? this.getEffectiveSchema(tool) : null
  }

  /** 获取工具类型（builtin / desktop / client） */
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
      if (!this.isToolAllowed(profile, name)) continue
      result.push(this.getEffectiveSchema(tool))
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
      if (!this.isToolAllowed(profile, name)) continue
      result.push(this.getEffectiveSchema(tool))
    }
    return result
  }

  // ════════════════════════════════════════════════════════════
  // per-agent 工具集白名单（按 AgentMode.getToolset 注入）
  // ════════════════════════════════════════════════════════════

  /** 注入某 profile 的可允许工具集（'*' 或空数组 = 全量——撤销白名单限制） */
  setProfileToolset(profile: string, toolset: string[]): void {
    if (!toolset || toolset.length === 0) return
    if (toolset.length === 1 && toolset[0] === '*') {
      this.profileToolsets.delete(profile)
      return
    }
    this.profileToolsets.set(profile, new Set(toolset))
  }

  /** 某 profile 是否允许某工具（白名单判断——未设白名单 = 全量放行） */
  private isToolAllowed(profile: string, toolName: string): boolean {
    const set = this.profileToolsets.get(profile)
    if (!set) return true
    return set.has(toolName)
  }

  // ════════════════════════════════════════════════════════════
  // 禁用工具配置（本地 Map）
  // ════════════════════════════════════════════════════════════

  getDisabledTools(profile: string): string[] {
    return [...this.getDisabledSet(profile)]
  }

  disableTool(profile: string, toolName: string): void {
    this.getDisabledSet(profile).add(toolName)
    this.persistDisabled(profile)
  }

  enableTool(profile: string, toolName: string): void {
    this.getDisabledSet(profile).delete(toolName)
    this.persistDisabled(profile)
  }

  /**
   * 批量注入已保存的禁用列表（应用启动时调用——持久化于 app_settings）
   * @param map profile → 禁用的工具名列表
   */
  loadDisabled(map: Record<string, string[]>): void {
    for (const [profile, names] of Object.entries(map)) {
      if (!Array.isArray(names)) continue
      for (const name of names) this.getDisabledSet(profile).add(name)
    }
  }

  /** 持久化回调（bootstrap 注入——写 app_settings） */
  setPersistence(onPersist: (profile: string, toolNames: string[]) => void): void {
    this.persist = onPersist
  }

  private persist: ((profile: string, toolNames: string[]) => void) | null = null

  private persistDisabled(profile: string): void {
    try {
      this.persist?.(profile, this.getDisabledTools(profile))
    } catch (e) {
      console.error('[ToolManager] 持久化禁用工具失败:', (e as Error).message)
    }
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

  /** execute 兜底：当前 Agent 是否允许调某工具——优先用本周期已装配的 ctx.toolNames（DB/mode 白名单） */
  private isToolAllowedFor(ctx: ToolContext, toolName: string): boolean {
    if (ctx.toolNames && ctx.toolNames.length > 0) {
      return ctx.toolNames.includes(toolName)
    }
    return this.isToolAllowed(ctx.profile, toolName)
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

    const toolType = this.toolTypes.get(toolName)

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
