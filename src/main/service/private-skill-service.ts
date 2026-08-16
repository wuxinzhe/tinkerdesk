/**
 * private-skill-service.ts — 私有技能服务层
 *
 * IPrivateSkillService (local single-user, no userId):
 * skill CRUD (incl. soft delete/restore), skill files, skill relations,
 * filtered queries.
 */
import { PrivateSkillFileRepository } from '../repository/private-skill-file-repository'
import { PrivateSkillRelatedRepository } from '../repository/private-skill-related-repository'
import { PrivateSkillRepository } from '../repository/private-skill-repository'
import { withTransaction } from '../repository/database'
import type { FilteredSkillDTO, PrivateSkillEntity, SkillFileEntity, SkillRelatedEntity } from '../repository/types'

/** 私有技能服务 */
export class PrivateSkillService {
  constructor(
    private readonly skillRepo: PrivateSkillRepository,
    private readonly fileRepo: PrivateSkillFileRepository,
    private readonly relatedRepo: PrivateSkillRelatedRepository
  ) { }

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
   * 保存技能（新建时 id 留空 → DB 自增生成；已存在按 name UPSERT）。
   * 返回技能实体（新建场景调用方需用 findByName 重查拿自增 id）。
   */
  save(profile: string, skill: Omit<PrivateSkillEntity, 'id' | 'profile' | 'isDeleted' | 'deletedAt'> & { id?: string }): PrivateSkillEntity {
    const entity: PrivateSkillEntity = {
      id: skill.id ?? '',
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

  /** 硬删除技能（物理删行 + 级联删除关联文件与关联关系——事务：中途失败整体回滚） */
  hardDelete(profile: string, id: string): boolean {
    return withTransaction(() => {
      if (this.skillRepo.hardDelete(profile, id) > 0) {
        this.fileRepo.deleteBySkillId(id)
        this.relatedRepo.deleteBySkillId(id)
        this.relatedRepo.deleteByRelatedSkillId(id)
        return true
      }
      return false
    })
  }

  /** 恢复技能 */
  restore(profile: string, id: string): boolean {
    return this.skillRepo.restore(profile, id) > 0
  }

  // ── 技能文件 ──

  /** 保存技能文件 */
  saveSkillFile(skillId: string, fileType: string, content: string, language: string, sortOrder: number, name = ''): void {
    // 语言未显式传入时按文件后缀解析（导入/API 直调都覆盖）
    const lang = language || languageFromName(name)
    this.fileRepo.save({ skillId, fileType, name, content, language: lang, sortOrder })
  }

  /** 删除技能下指定类型的文件 */
  deleteSkillFilesByType(skillId: string, fileType: string): void {
    this.fileRepo.deleteBySkillIdAndFileType(skillId, fileType)
  }

  /** 按 id 更新技能文件 */
  updateSkillFile(id: number, input: { fileType?: string; name?: string; content?: string; language?: string; sortOrder?: number }): boolean {
    const existing = this.fileRepo.findById(id)
    if (!existing) return false
    return this.fileRepo.update({
      ...existing,
      fileType: input.fileType ?? existing.fileType,
      name: input.name ?? existing.name,
      content: input.content ?? existing.content,
      language: input.language ?? existing.language,
      sortOrder: input.sortOrder ?? existing.sortOrder,
    })
  }

  /** 新增技能文件（返回新 id） */
  addSkillFile(skillId: string, input: { fileType: string; name?: string; content?: string; language?: string; sortOrder?: number }): number {
    return this.fileRepo.save({
      skillId,
      fileType: input.fileType,
      name: input.name ?? '',
      content: input.content ?? '',
      language: input.language ?? '',
      sortOrder: input.sortOrder ?? 0,
    })
  }

  /** 按 id 删除技能文件 */
  deleteSkillFile(id: number): boolean {
    return this.fileRepo.deleteById(id)
  }

  /** 查询技能文件列表 */
  listSkillFiles(skillId: string): SkillFileEntity[] {
    return this.fileRepo.findBySkillId(skillId)
  }

  /** 按 id 查单个技能文件（skill_view fileId 参数加载 content 用） */
  getSkillFileById(id: number): SkillFileEntity | null {
    return this.fileRepo.findById(id)
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

  /** 清空技能关联（编辑全量替换用） */
  clearRelated(skillId: string): void {
    this.relatedRepo.deleteBySkillId(skillId)
  }

  // ── 技能详情（skill_view 用） ──

  /** 按名称查询技能详情（含附件文件——controller/skill_manage 等按 name 场景用） */
  viewSkill(profile: string, name: string): (PrivateSkillEntity & { files: SkillFileEntity[] }) | null {
    const entity = this.skillRepo.findByName(profile, name)
    if (!entity) return null
    const files = this.fileRepo.findBySkillId(entity.id)
    return { ...entity, files }
  }

  /** 按技能 id 查询详情（含附件文件 + 关联技能，供 skill_view 渲染——唯一指向为 id） */
  viewSkillById(profile: string, id: string): (PrivateSkillEntity & { files: SkillFileEntity[]; related: Array<{ id: string; name: string }> }) | null {
    const entity = this.skillRepo.findById(profile, id)
    if (!entity) return null
    const files = this.fileRepo.findBySkillId(entity.id)
    // 关联技能（private_skill_related——related 关系——嵌套/关联展示）
    const related = this.relatedRepo.findBySkillId(entity.id)
      .map((r) => this.skillRepo.findById(profile, String(r.relatedSkillId)))
      .filter((s): s is PrivateSkillEntity => s !== null && !s.isDeleted)
      .map((s) => ({ id: s.id, name: s.name }))
    return { ...entity, files, related }
  }

  // ── 技能列表（skills_list 用） ──

  /** 查询技能列表（未删除，轻量字段） */
  listSkills(profile: string): FilteredSkillDTO[] {
    return this.skillRepo.findFiltered(profile)
  }

  // ── 技能创建/更新（skill_manage 用） ──

  /** 创建技能（body 必填，重名返回 null；支持 frontmatter 全字段） */
  createSkill(profile: string, input: {
    name: string
    displayName?: string
    description?: string
    category?: string
    version?: string
    author?: string
    license?: string
    platforms?: string
    tags?: string
    dependencies?: string
    requiresToolsets?: string
    requiresTools?: string
    fallbackForToolsets?: string
    fallbackForTools?: string
    triggers?: string
    triggerConditions?: string
    commands?: string
    envVars?: string
    compatibility?: string
    allowedTools?: string
    metadata?: string
    config?: string
    body: string
    apiKey?: string | null
  }): PrivateSkillEntity | null {
    if (this.skillRepo.countByName(profile, input.name) > 0) {
      return null
    }
    const saved = this.save(profile, {
      name: input.name,
      displayName: input.displayName ?? input.name,
      description: input.description ?? '',
      category: input.category ?? '',
      body: input.body,
      apiKey: input.apiKey ?? null,
      version: input.version ?? '',
      author: input.author ?? '',
      license: input.license ?? '',
      platforms: input.platforms ?? '',
      tags: input.tags ?? '',
      dependencies: input.dependencies ?? '',
      requiresToolsets: input.requiresToolsets ?? '',
      requiresTools: input.requiresTools ?? '',
      fallbackForToolsets: input.fallbackForToolsets ?? '',
      fallbackForTools: input.fallbackForTools ?? '',
      triggers: input.triggers ?? '',
      triggerConditions: input.triggerConditions ?? '',
      config: input.config ?? '[]',
      envVars: input.envVars ?? '',
      commands: input.commands ?? '',
      compatibility: input.compatibility ?? '',
      allowedTools: input.allowedTools ?? '',
      metadata: input.metadata ?? '{}',
      envs: null,
      officialSkillId: null,
    })
    // 新建场景：重查拿 DB 自增 id（save 返回的实体 id 为空）
    return this.skillRepo.findByName(profile, input.name) ?? saved
  }

  /** 安装技能（事务：技能行 + 附件文件 + 关联技能——中途失败整体回滚——controller/导入用） */
  installSkill(
    profile: string,
    input: Parameters<PrivateSkillService['createSkill']>[1],
    files: Array<{ fileType: string; content: string; sortOrder?: number; name?: string }>,
    related: string[] = []
  ): PrivateSkillEntity | null {
    return withTransaction(() => {
      const created = this.createSkill(profile, input)
      if (!created) return null
      files.forEach((f, idx) => {
        if (!f.fileType || !f.content) return
        this.saveSkillFile(created.id, f.fileType, f.content, '', f.sortOrder ?? idx, f.name ?? '')
      })
      for (const relatedName of related) {
        const target = this.skillRepo.findByName(profile, relatedName.trim())
        if (target && target.id !== created.id) {
          this.addRelated(created.id, target.id, 'related')
        }
      }
      return created
    })
  }

  /** 更新技能 body（patch/edit 用） */
  updateSkillBody(profile: string, id: string, body: string): boolean {
    const existing = this.skillRepo.findById(profile, id)
    if (!existing) {
      return false
    }
    this.skillRepo.save({ ...existing, body })
    return true
  }

  /** 更新技能全字段（基础 + 依赖/回退/触发/环境；按 id 定位，返回更新后实体） */
  updateSkill(profile: string, id: string, input: {
    displayName?: string
    description?: string
    category?: string
    version?: string
    author?: string
    license?: string
    tags?: string
    platforms?: string
    dependencies?: string
    requiresToolsets?: string
    requiresTools?: string
    fallbackForToolsets?: string
    fallbackForTools?: string
    triggers?: string
    triggerConditions?: string
    config?: string
    envVars?: string
    commands?: string
    compatibility?: string
    allowedTools?: string
    metadata?: string
    envs?: string
    body?: string
  }): PrivateSkillEntity | null {
    const existing = this.skillRepo.findById(profile, id)
    if (!existing) {
      return null
    }
    const next: PrivateSkillEntity = {
      ...existing,
      displayName: input.displayName !== undefined ? input.displayName : existing.displayName,
      description: input.description !== undefined ? input.description : existing.description,
      category: input.category !== undefined ? input.category : existing.category,
      version: input.version !== undefined ? input.version : existing.version,
      author: input.author !== undefined ? input.author : existing.author,
      license: input.license !== undefined ? input.license : existing.license,
      tags: input.tags !== undefined ? toStoredList(input.tags) : existing.tags,
      platforms: input.platforms !== undefined ? toStoredList(input.platforms) : existing.platforms,
      dependencies: input.dependencies !== undefined ? toStoredList(input.dependencies) : existing.dependencies,
      requiresToolsets: input.requiresToolsets !== undefined ? toStoredList(input.requiresToolsets) : existing.requiresToolsets,
      requiresTools: input.requiresTools !== undefined ? toStoredList(input.requiresTools) : existing.requiresTools,
      fallbackForToolsets: input.fallbackForToolsets !== undefined ? toStoredList(input.fallbackForToolsets) : existing.fallbackForToolsets,
      fallbackForTools: input.fallbackForTools !== undefined ? toStoredList(input.fallbackForTools) : existing.fallbackForTools,
      triggers: input.triggers !== undefined ? toStoredList(input.triggers) : existing.triggers,
      triggerConditions: input.triggerConditions !== undefined ? input.triggerConditions : existing.triggerConditions,
      config: input.config !== undefined ? input.config : existing.config,
      envVars: input.envVars !== undefined ? input.envVars : existing.envVars,
      commands: input.commands !== undefined ? input.commands : existing.commands,
      compatibility: input.compatibility !== undefined ? input.compatibility : existing.compatibility,
      allowedTools: input.allowedTools !== undefined ? input.allowedTools : existing.allowedTools,
      metadata: input.metadata !== undefined ? input.metadata : existing.metadata,
      envs: input.envs !== undefined ? input.envs : existing.envs,
      body: input.body !== undefined ? input.body : existing.body,
    }
    this.skillRepo.save(next)
    return this.skillRepo.findById(profile, id)
  }

  /** 编辑技能 + 关联全量替换（事务：字段更新 + 清旧写新关联——中途失败整体回滚） */
  updateSkillWithRelated(
    profile: string,
    id: string,
    input: Parameters<PrivateSkillService['updateSkill']>[2],
    related: string[] | undefined
  ): PrivateSkillEntity | null {
    return withTransaction(() => {
      const updated = this.updateSkill(profile, id, input)
      if (!updated) return null
      this.clearRelated(id)
      if (related && related.length > 0) {
        for (const relatedName of related) {
          const target = this.skillRepo.findByName(profile, relatedName.trim())
          if (target && target.id !== id) {
            this.addRelated(id, target.id, 'related')
          }
        }
      }
      return updated
    })
  }
}

/** 文件后缀 → 语言映射（skill_files.language 列；saveSkillFile 未显式传语言时按后缀解析） */
const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', md: 'markdown', json: 'json', yaml: 'yaml', yml: 'yaml',
  hbs: 'handlebars', sql: 'sql', sh: 'bash', bash: 'bash', css: 'css',
  html: 'html', vue: 'vue', java: 'java', go: 'go', rs: 'rust',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', txt: 'text', csv: 'csv',
  xml: 'xml', svg: 'xml', toml: 'toml', ini: 'ini', bat: 'batch', ps1: 'powershell',
}

/** 按文件后缀解析语言（无后缀/未知返回空串——不猜测） */
function languageFromName(name: string): string {
  const ext = (name.split('.').pop() ?? '').toLowerCase()
  return LANGUAGE_BY_EXT[ext] ?? ''
}

/** 逗号分隔串 → 存储格式（JSON 数组字符串 "[a, b]"）——容忍 `[a, b]` / `a, b` / 混合 */
function toStoredList(raw: string): string {
  const cleaned = raw.trim().replace(/^\[/, '').replace(/\]$/, '')
  const arr = cleaned.split(',').map((x) => x.trim()).filter(Boolean)
  return JSON.stringify(arr)
}
