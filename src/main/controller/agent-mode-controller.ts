/**
 * agent-mode-controller.ts — Agent Mode IPC controller（class 形式）
 *
 * 复刻 tinker-agent AgentModeController（本地单用户版）：
 * 模式列表 / 选项 / 详情 / 配置检查。
 * 分层：controller → service（AgentModeService），不直接访问 registry。
 * IPC 前缀：agent-mode:*
 */
import { ipcMain } from 'electron'
import type { AgentModeService } from '../service/agent-mode-service'
import type { ModeInfoDTO, ModeOptionDTO } from '../core/mode/agent-mode'
import { ok, fail } from './api-response'
import type { ApiResponse } from './api-response'

/** Agent Mode controller */
export class AgentModeController {
  constructor(private readonly agentModeService: AgentModeService) { }

  /** 注册全部 IPC handler（只做绑定，逻辑在独立具名方法） */
  register(): void {
    ipcMain.handle('agent-mode:list', () => this.listModes())
    ipcMain.handle('agent-mode:options', () => this.listModeOptions())
    ipcMain.handle('agent-mode:get', (_event, payload: { id: string; version: string }) => this.getMode(payload))
    ipcMain.handle('agent-mode:check', (_event, payload: { profile: string }) => this.checkModeConfig(payload))
  }

  // ══════════════════════════════════════════════════════════════
  // 各 IPC 方法（具名方法 + 完整入参出参类型）
  // ══════════════════════════════════════════════════════════════

  /** 查询全部已注册模式（平铺） */
  private listModes(): ApiResponse<ModeInfoDTO[]> {
    return ok(this.agentModeService.list())
  }

  /** 查询模式选项（前端下拉用） */
  private listModeOptions(): ApiResponse<ModeOptionDTO[]> {
    return ok(this.agentModeService.listOptions())
  }

  /** 按 id + version 查模式详情 */
  private getMode(payload: { id: string; version: string }): ApiResponse<ModeInfoDTO | null> {
    const mode = this.agentModeService.get(payload.id, payload.version)
    if (!mode) {
      return fail(`Agent Mode 不存在: ${payload.id}/${payload.version}`)
    }
    return ok(mode)
  }

  /** 检查当前 agent 的模式配置是否有效 */
  private checkModeConfig(payload: { profile: string }): ApiResponse<{ ok: boolean; detail: string }> {
    return ok(this.agentModeService.checkAgentMode(payload.profile))
  }
}
