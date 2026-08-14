/**
 * tool-controller.ts — 工具清单与禁用配置 IPC controller（class 形式）
 *
 * ToolController (local single-user, no userId):
 * Tool list / disable-enable.
 * Layering: controller → ToolManager (tool-domain service layer).
 * IPC prefix: tool-config:*
 *
 * Structure: register() only binds ipcMain.handle; logic lives in
 * named methods with fully typed params/returns.
 */

import { handleTrusted } from '../security/ipc-guard'
import type { ToolManager } from '../core/tool/tool-manager'
import type { ApiResponse } from './api-response'
import { ok, fail } from './api-response'
import type { ToolItemVO, ToolListQueryDTO, ToggleToolRequestDTO } from './types'

/** 工具 controller */
export class ToolController {
  constructor(private readonly toolManager: ToolManager) { }

  /** 注册全部 IPC handler（只做绑定，逻辑在独立具名方法） */
  register(): void {
    handleTrusted('tool-config:list', (_event, payload) => this.listToolConfigs(payload))
    handleTrusted('tool-config:toggle', (_event, payload) => this.toggleToolConfig(payload))
  }

  // ══════════════════════════════════════════════════════════════
  // 各 IPC 方法（具名方法 + 完整入参出参类型）
  // ══════════════════════════════════════════════════════════════

  /** 查询工具清单（含禁用状态 + 工具类型，按 profile 限定） */
  private listToolConfigs(payload: ToolListQueryDTO): ApiResponse<ToolItemVO[]> {
    const profile = payload?.profile ?? 'default'
    const toolType = payload?.toolType
    const disabled = this.toolManager.getDisabledTools(profile)
    const errors = this.toolManager.getToolErrors()
    const schemas = this.toolManager.getAllSchemas()
    const tools: ToolItemVO[] = schemas
      .filter((s) => !toolType || s.toolType === toolType)
      .map((s) => ({
        name: s.name,
        description: s.description ?? '',
        disabled: disabled.includes(s.name),
        toolType: s.toolType,
        supportsProvider: s.supportsProvider,
        error: errors.get(s.name) ?? undefined,
      }))
    return ok(tools)
  }

  /** 启用/禁用工具（按 profile 限定） */
  private toggleToolConfig(payload: ToggleToolRequestDTO): ApiResponse<ToolItemVO> {
    const { toolName, disabled } = payload
    const profile = payload?.profile ?? 'default'
    if (!toolName) {
      return fail('toolName 不能为空')
    }
    if (disabled) {
      this.toolManager.disableTool(profile, toolName)
    } else {
      this.toolManager.enableTool(profile, toolName)
    }
    return ok({ name: toolName, description: '', disabled, toolType: '' })
  }
}
