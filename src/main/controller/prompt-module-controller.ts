/**
 * prompt-module-controller.ts — 提示词模块 IPC controller（class 形式）
 *
 * UserPromptModuleController（本地单用户版，去 userId）：
 * 模块列表 / 创建 / 更新 / 删除 / 启用停用。
 * 分层：controller → service（PromptService）。
 * 表含 profile 字段 → 全链路 profile 必传限定（controller → service → repository）。
 * IPC 前缀：prompt-module:*
 */

import { handleTrusted } from '../security/ipc-guard'
import type {PromptService} from '../service/prompt-service'
import type {UserPromptModuleEntity} from '../repository/types'
import type {ApiResponse} from './api-response'
import {ok, fail} from './api-response'
import type {CreatePromptModuleRequestDTO, UpdatePromptModuleRequestDTO, PromptModuleIdRequestDTO, TogglePromptModuleRequestDTO} from './types'

/** 提示词模块 controller */
export class PromptModuleController {
  constructor(private readonly moduleService: PromptService) { }

  /** 注册全部 IPC handler（只做绑定，逻辑在独立方法） */
  register(): void {
    handleTrusted('prompt-module:list', (_event, profile?: string) => this.listPromptModules(profile))
    handleTrusted('prompt-module:create', (_event, payload: CreatePromptModuleRequestDTO) => this.createPromptModule(payload))
    handleTrusted('prompt-module:update', (_event, payload: UpdatePromptModuleRequestDTO) => this.updatePromptModule(payload))
    handleTrusted('prompt-module:delete', (_event, payload: PromptModuleIdRequestDTO) => this.deletePromptModule(payload))
    handleTrusted('prompt-module:toggle', (_event, payload: TogglePromptModuleRequestDTO) => this.togglePromptModule(payload))
  }

  // ══════════════════════════════════════════════════════════════
  // 各 IPC 方法（具名方法 + 完整入参出参类型）
  // ══════════════════════════════════════════════════════════════

  /** 查询提示词模块列表（按 profile 限定） */
  private listPromptModules(profile?: string): ApiResponse<UserPromptModuleEntity[]> {
    return ok(this.moduleService.listByProfile(profile ?? 'default'))
  }

  /** 创建提示词模块（profile 必传） */
  private createPromptModule(payload: CreatePromptModuleRequestDTO): ApiResponse<UserPromptModuleEntity> {
    const profile = payload.profile
    if (!payload.name || !payload.content) {
      return fail('name 和 content 不能为空')
    }
    const module = this.moduleService.create(profile, payload.name, payload.content, payload.enabled ?? true)
    if (!module) {
      return fail(`模块已存在: ${payload.name}`)
    }
    return ok(module)
  }

  /** 更新提示词模块（profile 限定） */
  private updatePromptModule(payload: UpdatePromptModuleRequestDTO): ApiResponse<UserPromptModuleEntity> {
    const existing = this.moduleService.findById(payload.id, payload.profile)
    if (!existing) {
      return fail('模块不存在')
    }
    const updated = this.moduleService.update({
      ...existing,
      profile: payload.profile,
      name: payload.name,
      content: payload.content,
      sortOrder: payload.sortOrder ?? existing.sortOrder,
    })
    if (!updated) {
      return fail('更新失败')
    }
    const result = this.moduleService.findById(payload.id, payload.profile)
    return result ? ok(result) : fail('模块不存在')
  }

  /** 删除提示词模块（profile 限定） */
  private deletePromptModule(payload: PromptModuleIdRequestDTO): ApiResponse<null> {
    const deleted = this.moduleService.deleteById(payload.id, payload.profile)
    return deleted ? ok(null) : fail('模块不存在')
  }

  /** 启用/停用提示词模块（profile 限定） */
  private togglePromptModule(payload: TogglePromptModuleRequestDTO): ApiResponse<null> {
    const updated = this.moduleService.setEnabled(payload.id, payload.enabled, payload.profile)
    return updated ? ok(null) : fail('模块不存在')
  }
}
