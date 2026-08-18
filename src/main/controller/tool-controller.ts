/**
 * tool-controller.ts — 工具清单与授权配置 IPC controller（class 形式）
 *
 * ToolController (local single-user, no userId)：
 * 面向用户的工具列表——与 Agent 实际装配保持一致（同一来源 = 该 profile 的 AgentMode.getToolset）。
 *
 * 分模式：
 *   butler   → 工具集为空（空）
 *   creator  → 授权集（agent_tools）可编辑（editable，勾选 = authorize/revoke）
 *   default / minimal → mode 固定工具集，只读（editable=false）
 *
 * Layering: controller → AgentMode/AgentToolService/ToolManager。
 * IPC prefix: tool-config:*
 */
import { handleTrusted } from '../security/ipc-guard'
import type { ToolManager } from '../core/tool/tool-manager'
import type { AgentService } from '../service/agent-service'
import type { AgentModeRegistry } from '../core/mode/agent-mode-registry'
import type { AgentToolService } from '../service/agent-tool-service'
import type { IAgentMode } from '../core/mode/agent-mode'
import type { ApiResponse } from './api-response'
import { ok, fail } from './api-response'
import type { ToolItemVO, ToolListQueryDTO, ToggleToolRequestDTO } from './types'

/** 工具 controller */
export class ToolController {
  constructor(
    private readonly toolManager: ToolManager,
    private readonly agentService: AgentService,
    private readonly agentModeRegistry: AgentModeRegistry,
    private readonly agentToolService: AgentToolService,
  ) {}

  /** 注册全部 IPC handler（只做绑定，逻辑在独立具名方法） */
  register(): void {
    handleTrusted('tool-config:list', (_event, payload) => this.listToolConfigs(payload))
    handleTrusted('tool-config:toggle', (_event, payload) => this.toggleToolConfig(payload))
  }

  // ══════════════════════════════════════════════════════════════
  // 各 IPC 方法（具名方法 + 完整入参出参类型）
  // ══════════════════════════════════════════════════════════════

  /** 按 profile 解析当前 Agent Mode（与 Agent 装配同一来源） */
  private resolveMode(profile: string): IAgentMode {
    const agent = this.agentService.getAgentInfo(profile)
    const modeId = agent?.agentModeId ?? 'default'
    return this.agentModeRegistry.getAgentMode(modeId) ?? this.agentModeRegistry.getAgentMode('default')!
  }

  /**
   * 查询工具清单（面向用户——与该 profile 的 Agent 实际装配一致）：
   * - butler：空
   * - creator：授权集（agent_tools）可编辑——显示全量可授权工具，authorized 标记勾选态
   * - 其余（default/minimal）：mode 固定工具集，只读（editable=false）
   */
  private listToolConfigs(payload: ToolListQueryDTO): ApiResponse<ToolItemVO[]> {
    const profile = payload?.profile ?? 'default'
    const toolType = payload?.toolType
    const mode = this.resolveMode(profile)
    const modeId = mode.meta.id
    const disabled = this.toolManager.getDisabledTools(profile)
    const errors = this.toolManager.getToolErrors()
    const allSchemas = this.toolManager.getAllSchemas().filter((s) => !toolType || s.toolType === toolType)

    // butler：空工具集
    if (modeId === 'butler') {
      return ok([])
    }

    // creator：授权集可编辑（显示全量可授权，勾选 = authorized）
    if (modeId === 'creator') {
      const authorized = this.agentToolService.getAuthorized(profile)
      return ok(allSchemas.map((s) => ({
        name: s.name,
        description: s.description ?? '',
        disabled: disabled.includes(s.name),
        toolType: s.toolType,
        supportsProvider: s.supportsProvider,
        error: errors.get(s.name) ?? undefined,
        editable: true,
        authorized: authorized.includes(s.name),
      })))
    }

    // default / minimal：mode 固定工具集，只读
    const toolset = new Set(mode.getToolset(profile) ?? [])
    return ok(allSchemas
      .filter((s) => toolset.has(s.name))
      .map((s) => ({
        name: s.name,
        description: s.description ?? '',
        disabled: disabled.includes(s.name),
        toolType: s.toolType,
        supportsProvider: s.supportsProvider,
        error: errors.get(s.name) ?? undefined,
        editable: false,
      })))
  }

  /**
   * 启用/禁用（按 profile 限定）：
   * - 仅 creator 模式可编辑（authorize/revoke agent_tools）——其余模式只读，拒绝修改
   */
  private toggleToolConfig(payload: ToggleToolRequestDTO): ApiResponse<ToolItemVO> {
    const { toolName } = payload
    const profile = payload?.profile ?? 'default'
    if (!toolName) {
      return fail('toolName 不能为空')
    }
    const mode = this.resolveMode(profile)
    if (mode.meta.id !== 'creator') {
      return fail('当前模式的工具集不可编辑（仅创造者模式支持自由选配）')
    }
    const authorized = this.agentToolService.getAuthorized(profile)
    const isAuthorized = authorized.includes(toolName)
    if (payload.authorized === true && !isAuthorized) {
      this.agentToolService.authorize(profile, toolName)
    } else if (payload.authorized === false && isAuthorized) {
      this.agentToolService.revoke(profile, toolName)
    }
    return ok({ name: toolName, description: '', disabled: !payload.authorized, toolType: '' })
  }
}
