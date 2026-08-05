/**
 * private-skill-service.ts — 私有技能服务层
 *
 * 复刻 showing-agent IPrivateSkillService（本地单用户版，去 userId）：
 * 技能 CRUD（含软删/恢复）、技能文件、技能关联、过滤查询。
 */
import {randomUUID} from 'crypto'
import {PrivateSkillRepository} from '../repository/private-skill-repository'
import {PrivateSkillFileRepository} from '../repository/private-skill-file-repository'
import {PrivateSkillRelatedRepository} from '../repository/private-skill-related-repository'
import type {PrivateSkillEntity, FilteredSkillDTO, SkillFileEntity, SkillRelatedEntity} from '../repository/types'

/** 私有技能服务 */
export class PrivateSkillService {
  constructor(
    private readonly skillRepo: PrivateSkillRepository,
    private readonly fileRepo: PrivateSkillFileRepository,
    private readonly relatedRepo: PrivateSkillRelatedRepository
  ) {}

  /** 按名称查询技能 */
  findByName(profile: string, name: string): PrivateSkillEntity | null {
    return this.skillRepo.findByName(profile, name)
  }

  /** 按 ID 查询技能 */
  findById(profile: string, id: string): PrivateSkillEntity | null {
    return this.skillRepo.findById(profile, id)
  }

  /** 查询 profile 下全部技能 */
  findByAgent(profile: string): PrivateSkillEntity[] {
    return this.skillRepo.findByAgent(profile)
  }

  /** 同名技能计数（重名检查） */
  countByName(profile: string, name: string): number {
    return this.skillRepo.countByName(profile, name)
  }

  /** 未删除技能计数 */
  countEnabled(profile: string): number {
    return this.skillRepo.countEnabled(profile)
  }

  /** 过滤后的技能列表（不含正文，轻量） */
  findFiltered(profile: string): FilteredSkillDTO[] {
    return this.skillRepo.findFiltered(profile)
  }

  /**
   * 保存技能（新建生成 ID，已存在按 name UPSERT）。
   * 返回技能实体。
   */
  save(profile: string, skill: Omit<PrivateSkillEntity, 'id' | 'profile' | 'isDeleted' | 'deletedAt'> & {id?: string}): PrivateSkillEntity {
    const entity: PrivateSkillEntity = {
      id: skill.id ?? randomUUID(),
      profile,
      isDeleted: false,
      deletedAt: null,
      ...skill,
    }
    this.skillRepo.save(entity)
    return entity
  }

  /** 软删除技能 */
  softDelete(profile: string, id: string): boolean {
    return this.skillRepo.softDelete(profile, id) > 0
  }

  /** 恢复技能 */
  restore(profile: string, id: string): boolean {
    return this.skillRepo.restore(profile, id) > 0
  }

  // ── 技能文件 ──

  /** 保存技能文件 */
  saveSkillFile(skillId: string, fileType: string, content: string, language: string, sortOrder: number): void {
    this.fileRepo.save({skillId, fileType, content, language, sortOrder})
  }

  /** 删除技能下指定类型的文件 */
  deleteSkillFilesByType(skillId: string, fileType: string): void {
    this.fileRepo.deleteBySkillIdAndFileType(skillId, fileType)
  }

  /** 查询技能文件列表 */
  listSkillFiles(skillId: string): SkillFileEntity[] {
    return this.fileRepo.findBySkillId(skillId)
  }

  // ── 技能关联 ──

  /** 添加关联（不存在才插入） */
  addRelated(skillId: string, relatedSkillId: string, relationType: string): boolean {
    return this.relatedRepo.insertIfNotExists(skillId, relatedSkillId, relationType) > 0
  }

  /** 查询技能关联 */
  listRelated(skillId: string): SkillRelatedEntity[] {
    return this.relatedRepo.findBySkillId(skillId)
  }

  // ── 技能详情（skill_view 用） ──

  /** 查询技能详情（含文件，供 skill_view 渲染） */
  viewSkill(profile: string, name: string): PrivateSkillEntity | null {
    return this.skillRepo.findByName(profile, name)
  }

  // ── 技能列表（skills_list 用） ──

  /** 查询技能列表（未删除，轻量字段） */
  listSkills(profile: string): FilteredSkillDTO[] {
    return this.skillRepo.findFiltered(profile)
  }

  // ── 技能创建/更新（skill_manage 用） ──

  /** 创建技能（body 必填，重名返回 null） */
  createSkill(profile: string, input: {name: string; displayName?: string; description?: string; category?: string; body: string; apiKey?: string | null}): PrivateSkillEntity | null {
    if (this.skillRepo.countByName(profile, input.name) > 0) {
      return null
    }
    return this.save(profile, {
      name: input.name,
      displayName: input.displayName ?? input.name,
      description: input.description ?? '',
      category: input.category ?? '',
      body: input.body,
      apiKey: input.apiKey ?? null,
      version: '',
      author: '',
      license: '',
      platforms: '',
      tags: '',
      dependencies: '',
      requiresToolsets: '',
      requiresTools: '',
      fallbackForToolsets: '',
      fallbackForTools: '',
      triggers: '',
      triggerConditions: '',
      config: '[]',
      envVars: '',
      commands: '',
      envs: null,
      officialSkillId: null,
    })
  }

  /** 更新技能 body（patch/edit 用） */
  updateSkillBody(profile: string, id: string, body: string): boolean {
    const existing = this.skillRepo.findById(profile, id)
    if (!existing) {
      return false
    }
    this.skillRepo.save({...existing, body})
    return true
  }
}
