/**
 * skill-category-repository.ts — Skill-category repository (local JSON source)
 *
 * The local client does not create a skill_categories table; category data is
 * maintained in a JSON file (src/main/resources/skill-categories.json —
 * seed data for the skill_categories table). insert-to-DB kept (compat);
 * reads always go through JSON.
 */
import { readFileSync } from 'fs'
import { resolveResource } from '../utils/resources-path'
import type { SkillCategoryEntity } from './types'

interface CategoryJson {
  id: string
  name: string
  displayName: string
  description?: string
  icon?: string
  sortOrder?: number
  isActive?: boolean
}

let cache: SkillCategoryEntity[] | null = null

function loadFromJson(): SkillCategoryEntity[] {
  if (cache) return cache
  try {
    const file = resolveResource('skill-categories.json')
    const list = JSON.parse(readFileSync(file, 'utf-8')) as CategoryJson[]
    cache = list.map((c) => ({
      id: c.id,
      name: c.name,
      displayName: c.displayName,
      description: c.description ?? '',
      icon: c.icon ?? '',
      sortOrder: c.sortOrder ?? 0,
      isActive: c.isActive ?? true,
      createdAt: '',
      updatedAt: '',
    }))
  } catch (e) {
    console.warn(`[SkillCategory] 分类 JSON 读取失败: ${(e as Error).message}`)
    cache = []
  }
  return cache
}

/** 技能分类仓库 */
export class SkillCategoryRepository {
  /** 查询全部分类（JSON） */
  findAll(): SkillCategoryEntity[] {
    return [...loadFromJson()].sort((a, b) => a.sortOrder - b.sortOrder)
  }

  /** 查询启用的分类（JSON） */
  findActive(): SkillCategoryEntity[] {
    return loadFromJson().filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder)
  }

  /** 按 ID 查询 */
  findById(id: string): SkillCategoryEntity | null {
    return loadFromJson().find((c) => c.id === id) ?? null
  }

  /** 按名称查询 */
  findByName(name: string): SkillCategoryEntity | null {
    return loadFromJson().find((c) => c.name === name) ?? null
  }

  /** 插入分类（名称冲突忽略；本地 JSON 只读，保留接口兼容） */
  insert(_entity: SkillCategoryEntity): void {
    // 本地客户端分类由 JSON 文件维护，不写库
  }
}
