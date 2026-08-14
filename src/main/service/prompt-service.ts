/**
 * prompt-service.ts — 提示词模块服务层
 *
 * UserPromptModuleService（本地单用户版，去 userId/User 前缀）：
 * 模块列表（含启用态过滤）、创建（自动排序）、更新、启用/停用、删除。
 */
import { PromptModuleRepository } from '../repository/prompt-module-repository'
import type { UserPromptModuleEntity } from '../repository/types'

/** 提示词模块服务 */
export class PromptService {
  constructor(private readonly moduleRepo: PromptModuleRepository) { }

  /** 查询 profile 下全部模块（按 sort_order 升序） */
  listByProfile(profile: string): UserPromptModuleEntity[] {
    return this.moduleRepo.findByProfile(profile)
  }

  /** 查询 profile 下启用的模块 */
  listEnabled(profile: string): UserPromptModuleEntity[] {
    return this.moduleRepo.findByProfile(profile).filter((m) => m.enabled)
  }

  /** 按 ID 查询（profile 限定） */
  findById(id: number, profile: string): UserPromptModuleEntity | null {
    return this.moduleRepo.findById(id, profile)
  }

  /** 创建模块（自动分配下一个 sort_order） */
  create(profile: string, name: string, content: string, enabled = true): UserPromptModuleEntity | null {
    if (this.moduleRepo.countByName(profile, name) > 0) {
      return null
    }
    const existing = this.moduleRepo.findByProfile(profile)
    const nextOrder = existing.reduce((max, m) => Math.max(max, m.sortOrder), 0) + 1
    const id = this.moduleRepo.insert({ profile, name, content, sortOrder: nextOrder, enabled })
    return this.moduleRepo.findById(id, profile)
  }

  /** 更新模块内容/名称/排序（profile 限定） */
  update(entity: UserPromptModuleEntity): boolean {
    return this.moduleRepo.update(entity) > 0
  }

  /** 设置启用状态（profile 限定） */
  setEnabled(id: number, enabled: boolean, profile: string): boolean {
    return this.moduleRepo.setEnabled(id, enabled, profile) > 0
  }

  /** 删除模块（profile 限定） */
  deleteById(id: number, profile: string): boolean {
    return this.moduleRepo.deleteById(id, profile) > 0
  }
}
