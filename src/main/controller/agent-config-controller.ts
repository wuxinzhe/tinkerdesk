/**
 * agent-config-controller.ts — Agent runtime params IPC controller (class form)
 *
 * AgentConfigController (local single-user, no userId):
 * read / update / reset per-agent runtime params.
 * Layering: controller → service (AgentConfigService), never touches repository directly.
 * IPC prefix: agent-config:*
 *
 * Structure: register() only binds ipcMain.handle; logic lives in
 * named methods with fully typed params/returns.
 */

import { handleTrusted } from '../security/ipc-guard'
import type { AgentConfigService } from '../service/agent-config-service'
import type { AgentConfig } from '../core/loop/types'
import { ok, fail } from './api-response'
import type { ApiResponse } from './api-response'

/** Agent 运行参数 controller */
export class AgentConfigController {
  constructor(private readonly configService: AgentConfigService) { }

  /** 注册全部 IPC handler（只做绑定，逻辑在独立具名方法） */
  register(): void {
    handleTrusted('agent-config:get', (_event, profile) => this.getAgentConfig(profile))
    handleTrusted('agent-config:update', (_event, payload) => this.updateAgentConfig(payload))
    handleTrusted('agent-config:reset', (_event, profile) => this.resetAgentConfig(profile))
  }

  // ══════════════════════════════════════════════════════════════
  // 各 IPC 方法（具名方法 + 完整入参出参类型）
  // ══════════════════════════════════════════════════════════════

  /** 读取 Agent 运行参数（无 DB 行时抛错——配置缺失是异常） */
  private getAgentConfig(profile: string): ApiResponse<AgentConfig> {
    try {
      return ok(this.configService.get(profile))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 更新 Agent 运行参数（字段合并，无行抛错） */
  private updateAgentConfig(payload: { profile: string; config: Record<string, unknown> }): ApiResponse<null> {
    try {
      const { profile, config } = payload
      if (!profile) {
        return fail('profile 不能为空')
      }
      this.configService.update(profile, config)
      return ok(null)
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 重置 Agent 运行参数为模式默认配置 */
  private resetAgentConfig(profile: string): ApiResponse<AgentConfig> {
    try {
      const defaults = this.configService.reset(profile)
      return defaults ? ok(defaults) : fail('Agent 不存在')
    } catch (e) {
      return fail((e as Error).message)
    }
  }
}
