/**
 * account-controller.ts — 账号初始化 IPC controller（4 步向导版）
 *
 * 复刻 tinker-agent AccountController（本地单用户版，去 userId）：
 * - account:init-status      → 4 项初始化检查
 * - account:init-step-status → 分步状态检查（configured + 回显）
 * - account:init-step1       → 创建默认 Agent
 * - account:init-step2       → 写入 AgentConfig（合并保存）
 * - account:init-step3       → 创建含 API Key 的模型
 * - account:init-step4       → 绑定主聊天场景
 *
 * 结构：register() 只做 ipcMain.handle 绑定，逻辑在独立具名方法（入参出参完整类型）。
 */

import { handleTrusted } from '../security/ipc-guard'
import type { AccountService } from '../service/account-service'
import type { AgentInfoDTO, InitRequestDTO, InitStatusResponseDTO, StepStatusDTO } from '../service/types'
import { ok, fail } from './api-response'
import type { ApiResponse } from './api-response'

/** 本地单用户 profile */
const PROFILE = 'default'

/** 账号初始化 controller */
export class AccountController {
  constructor(private readonly accountService: AccountService) { }

  /** 注册全部 IPC handler（只做绑定，逻辑在独立具名方法） */
  register(): void {
    handleTrusted('account:init-status', () => this.getInitStatus())
    handleTrusted('account:init-step-status', (_event, input) => this.checkStepStatus(input))
    handleTrusted('account:init-step1', (_event, input) => this.runInitStep1(input))
    handleTrusted('account:init-step2', (_event, input) => this.saveAgentConfig(input))
    handleTrusted('account:init-step3', (_event, input) => this.createDefaultModel(input))
    handleTrusted('account:init-step4', (_event, input) => this.bindMainSceneModel(input))
  }

  // ══════════════════════════════════════════════════════════════
  // 各 IPC 方法（具名方法 + 完整入参出参类型）
  // ══════════════════════════════════════════════════════════════

  /** 查询初始化状态 */
  private getInitStatus(): ApiResponse<InitStatusResponseDTO> {
    try {
      return ok(this.accountService.checkInitStatus(PROFILE))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 检查指定步骤配置状态（configured 自动下一步；未配置返回回显数据） */
  private checkStepStatus(input: { step: number }): ApiResponse<StepStatusDTO> {
    try {
      if (!input?.step || ![2, 3, 4].includes(input.step)) {
        return fail('step 必填（2/3/4）')
      }
      return ok(this.accountService.getStepStatus(PROFILE, input.step))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 创建默认 Agent（Step 1，is_default=1） */
  private runInitStep1(input: { displayName?: string }): ApiResponse<AgentInfoDTO | null> {
    try {
      return ok(this.accountService.initStep1(PROFILE, input ?? {}))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 保存 AgentConfig（Step 2，合并写入：只更新表单填写的字段） */
  private saveAgentConfig(input: { config?: Record<string, unknown> }): ApiResponse<null> {
    try {
      this.accountService.initStep2(PROFILE, input?.config)
      return ok(null)
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 创建含 API Key 的模型 */
  private createDefaultModel(input: InitRequestDTO): ApiResponse<{ id: string }> {
    try {
      if (!input?.llmProvider || !input?.llmModel || !input?.llmApiKey) {
        return fail('llmProvider、llmModel、llmApiKey 必填')
      }
      const id = this.accountService.initStep3(PROFILE, input)
      return ok({ id })
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 绑定主聊天场景 */
  private bindMainSceneModel(input: { modelId: string }): ApiResponse<null> {
    try {
      if (!input?.modelId) {
        return fail('modelId 必填')
      }
      this.accountService.initStep4(PROFILE, input.modelId)
      return ok(null)
    } catch (e) {
      return fail((e as Error).message)
    }
  }
}
