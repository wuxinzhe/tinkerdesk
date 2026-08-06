/**
 * skill-controller.ts — 技能 IPC controller（class 形式）
 *
 * 复刻 tinker-agent SkillController（本地单用户版，去 userId/官方技能市场）：
 * 私有技能列表 / 详情 / 软删 / 恢复 + 技能分类。
 * 分层：controller → service（PrivateSkillService / SkillCategoryService）。
 * IPC 前缀：skill:*
 *
 * 结构：register() 只做 ipcMain.handle 绑定，逻辑在独立具名方法（入参出参完整类型）。
 */
import { ipcMain } from 'electron'
import type { PrivateSkillService } from '../service/private-skill-service'
import type { SkillCategoryService } from '../service/skill-category-service'
import type { PrivateSkillEntity } from '../repository/types'
import type { ApiResponse } from './api-response'
import { ok, fail } from './api-response'
import type { SkillInfoVO, SkillListQueryDTO, SkillPageVO, SkillOpRequestDTO } from './types'

/** PrivateSkillEntity → SkillInfoVO（includeBody 时携带正文，详情页用） */
export function toSkillInfoVO(s: PrivateSkillEntity, includeBody = false): SkillInfoVO {
  return {
    id: s.id,
    name: s.name,
    displayName: s.displayName,
    description: s.description,
    category: s.category,
    version: s.version,
    author: s.author,
    isEnabled: !s.isDeleted,
    body: includeBody ? (s.body ?? '') : undefined,
  }
}

/** 技能 controller */
export class SkillController {
  constructor(
    private readonly privateSkillService: PrivateSkillService,
    private readonly categoryService: SkillCategoryService
  ) { }

  /** 注册全部 IPC handler（只做绑定，逻辑在独立具名方法） */
  register(): void {
    ipcMain.handle('skill:list', (_event, payload) => this.listSkills(payload))
    ipcMain.handle('skill:byName', (_event, payload) => this.getSkillByName(payload))
    ipcMain.handle('skill:get', (_event, payload) => this.getSkill(payload))
    ipcMain.handle('skill:deactivate', (_event, payload) => this.deactivateSkill(payload))
    ipcMain.handle('skill:activate', (_event, payload) => this.activateSkill(payload))
    ipcMain.handle('skill:categories', () => this.listSkillCategories())
  }

  // ══════════════════════════════════════════════════════════════
  // 各 IPC 方法（具名方法 + 完整入参出参类型）
  // ══════════════════════════════════════════════════════════════

  /** 查询已安装技能列表（分页，按 profile 限定） */
  private listSkills(payload: SkillListQueryDTO): ApiResponse<SkillPageVO> {
    const profile = payload?.profile ?? 'default'
    const offset = payload?.offset ?? 0
    const limit = payload?.limit ?? 20
    const all = this.privateSkillService.findByAgent(profile).filter((s) => !s.isDeleted)
    const items = all.slice(offset, offset + limit).map((s) => toSkillInfoVO(s))
    return ok({ items, total: all.length, offset, limit })
  }

  /** 按名称查询技能详情 */
  private getSkillByName(payload: SkillOpRequestDTO): ApiResponse<SkillInfoVO> {
    const skill = this.privateSkillService.viewSkill(payload?.profile ?? 'default', payload?.name ?? '')
    if (!skill || skill.isDeleted) {
      return fail('Skill not found')
    }
    return ok(toSkillInfoVO(skill))
  }

  /** 按 ID 查询技能详情（对齐 Java GET /skills/{id}；详情带正文） */
  private getSkill(payload: SkillOpRequestDTO): ApiResponse<SkillInfoVO> {
    const skill = this.privateSkillService.findById(payload?.profile ?? 'default', payload?.id ?? '')
    if (!skill || skill.isDeleted) {
      return fail('Skill not found')
    }
    return ok(toSkillInfoVO(skill, true))
  }

  /** 停用技能（软删除，按 profile 限定） */
  private deactivateSkill(payload: SkillOpRequestDTO): ApiResponse<null> {
    const deleted = this.privateSkillService.softDelete(payload?.profile ?? 'default', payload?.id ?? '')
    return deleted ? ok(null) : fail('技能不存在')
  }

  /** 恢复技能（按 profile 限定） */
  private activateSkill(payload: SkillOpRequestDTO): ApiResponse<null> {
    const restored = this.privateSkillService.restore(payload?.profile ?? 'default', payload?.id ?? '')
    return restored ? ok(null) : fail('技能不存在或已达到启用上限')
  }

  /** 查询激活的技能分类列表 */
  private listSkillCategories(): ApiResponse<unknown> {
    return ok(this.categoryService.findActive())
  }
}
