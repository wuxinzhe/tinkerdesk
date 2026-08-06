/**
 * skill-category-service.ts — 技能分类服务层
 *
 * 复刻 tinker-agent ISkillCategoryService（本地单用户版）：
 * 分类列表/详情/创建/更新/删除。
 */
import { randomUUID } from 'crypto'
import { SkillCategoryRepository } from '../repository/skill-category-repository'
import type { SkillCategoryEntity } from '../repository/types'

/** 技能分类服务 */
export class SkillCategoryService {
  constructor(private readonly categoryRepo: SkillCategoryRepository) { }

  /** 查询全部分类 */
  findAll(): SkillCategoryEntity[] {
    return this.categoryRepo.findAll()
  }

  /** 查询启用的分类 */
  findActive(): SkillCategoryEntity[] {
    return this.categoryRepo.findActive()
  }

  /** 按 ID 查询 */
  findById(id: string): SkillCategoryEntity | null {
    return this.categoryRepo.findById(id)
  }

  /** 按名称查询 */
  findByName(name: string): SkillCategoryEntity | null {
    return this.categoryRepo.findByName(name)
  }

  /** 创建分类（名称冲突时返回 null） */
  create(input: Omit<SkillCategoryEntity, 'id'> & { id?: string }): SkillCategoryEntity | null {
    const existing = this.categoryRepo.findByName(input.name)
    if (existing) {
      return null
    }
    const entity: SkillCategoryEntity = {
      id: input.id ?? randomUUID(),
      ...input,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
      description: input.description ?? '',
      icon: input.icon ?? '',
    }
    this.categoryRepo.insert(entity)
    return entity
  }

  /** 更新分类（本地 JSON 只读，保留接口兼容返回 false） */
  update(_entity: SkillCategoryEntity): boolean {
    return false
  }
}
