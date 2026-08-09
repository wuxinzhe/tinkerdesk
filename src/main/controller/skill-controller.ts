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
import { dialog, BrowserWindow} from 'electron'
import { handleTrusted } from '../security/ipc-guard'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { dirname, join, relative, basename } from 'path'
import type { PrivateSkillService } from '../service/private-skill-service'
import type { SkillCategoryService } from '../service/skill-category-service'
import type { PrivateSkillEntity } from '../repository/types'
import type { ApiResponse } from './api-response'
import { ok, fail } from './api-response'
import type { SkillInfoVO, SkillListQueryDTO, SkillPageVO, SkillOpRequestDTO } from './types'

/** PrivateSkillEntity → SkillInfoVO（includeBody 时携带正文，详情页用；related 为关联技能列表） */
export function toSkillInfoVO(
  s: PrivateSkillEntity,
  includeBody = false,
  related?: Array<{ id: string; name: string }>
): SkillInfoVO {
  return {
    id: s.id,
    name: s.name,
    displayName: s.displayName,
    description: s.description,
    category: s.category,
    version: s.version,
    author: s.author,
    tags: parseTagList(s.tags),
    platforms: parseTagList(s.platforms),
    dependencies: parseTagList(s.dependencies),
    requiresToolsets: parseTagList(s.requiresToolsets),
    requiresTools: parseTagList(s.requiresTools),
    fallbackForToolsets: parseTagList(s.fallbackForToolsets),
    fallbackForTools: parseTagList(s.fallbackForTools),
    triggers: parseTagList(s.triggers),
    triggerConditions: s.triggerConditions ?? '',
    config: s.config ?? '[]',
    related: related ?? undefined,
    envVars: s.envVars ?? '',
    commands: s.commands ?? '',
    envs: s.envs ?? '',
    isEnabled: !s.isDeleted,
    body: includeBody ? (s.body ?? '') : undefined,
  }
}

/** 解析 tags/platforms 存储串（兼容 JSON 数组 "[a,b]" 或逗号分隔 "a,b"）→ 数组 */
function parseTagList(raw?: string | null): string[] {
  if (!raw || raw.trim() === '') return []
  const t = raw.trim()
  if (t.startsWith('[')) {
    try {
      const arr = JSON.parse(t)
      return Array.isArray(arr) ? arr.map(String) : []
    } catch {
      // fallthrough → 逗号分隔处理
    }
  }
  return t.split(',').map((x) => x.trim()).filter(Boolean)
}

/** 技能 controller */
export class SkillController {
  constructor(
    private readonly privateSkillService: PrivateSkillService,
    private readonly categoryService: SkillCategoryService,
    private readonly getWindow: () => BrowserWindow | null = () => null
  ) { }

  /** 注册全部 IPC handler（只做绑定，逻辑在独立具名方法） */
  register(): void {
    handleTrusted('skill:list', (_event, payload) => this.listSkills(payload))
    handleTrusted('skill:byName', (_event, payload) => this.getSkillByName(payload))
    handleTrusted('skill:get', (_event, payload) => this.getSkill(payload))
    handleTrusted('skill:deactivate', (_event, payload) => this.deactivateSkill(payload))
    handleTrusted('skill:activate', (_event, payload) => this.activateSkill(payload))
    handleTrusted('skill:categories', () => this.listSkillCategories())
    handleTrusted('skill:install', (_event, payload) => this.installSkill(payload))
    handleTrusted('skill:pick-install-file', () => this.pickInstallFile())
    handleTrusted('skill:update', (_event, payload) => this.updateSkill(payload))
    handleTrusted('skill:delete', (_event, payload) => this.deleteSkill(payload))
    handleTrusted('skill:file-list', (_event, payload) => this.listSkillFiles(payload))
    handleTrusted('skill:file-save', (_event, payload) => this.saveSkillFile(payload))
    handleTrusted('skill:file-update', (_event, payload) => this.updateSkillFile(payload))
    handleTrusted('skill:file-delete', (_event, payload) => this.deleteSkillFile(payload))
  }

  // ══════════════════════════════════════════════════════════════
  // 各 IPC 方法（具名方法 + 完整入参出参类型）
  // ══════════════════════════════════════════════════════════════

  /** 查询已安装技能列表（分页，按 profile 限定；支持分类 + 名称模糊过滤）
   *  UI 路径：不过滤软删（软删技能仍显示——可重新激活；Agent 查询路径另走 findFiltered 已过滤） */
  private listSkills(payload: SkillListQueryDTO): ApiResponse<SkillPageVO> {
    const profile = payload?.profile ?? 'default'
    const offset = payload?.offset ?? 0
    const limit = payload?.limit ?? 20
    const category = (payload?.category ?? '').trim()
    const name = (payload?.name ?? '').trim()
    let all = this.privateSkillService.findByAgent(profile)
    if (category) {
      all = all.filter((s) => s.category === category)
    }
    if (name) {
      const kw = name.toLowerCase()
      all = all.filter((s) => s.name.toLowerCase().includes(kw) || s.displayName.toLowerCase().includes(kw))
    }
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

  /** 技能详情（不过滤软删——软删技能可查看后激活；Agent 查询路径另走 findFiltered 已过滤） */
  private getSkill(payload: SkillOpRequestDTO): ApiResponse<SkillInfoVO> {
    const skill = this.privateSkillService.viewSkillById(payload?.profile ?? 'default', payload?.id ?? '')
    if (!skill) {
      return fail('Skill not found')
    }
    return ok(toSkillInfoVO(skill, true, skill.related))
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

  /**
   * 选择技能文件（.md/.txt）并读取内容：技能管理页「技能安装」按钮用。
   * 返回 { path, content }；取消返回 null。
   */
  /**
   * 选择技能文件夹（含 SKILL.md + references/scripts/templates 附件）→ 读取内容。
   * 返回 SKILL.md 全文 + 附件列表（fileType 按目录区分；递归收集）。
   */
  private async pickInstallFile(): Promise<ApiResponse<{ path: string; content: string; files: Array<{ fileType: string; name: string; content: string; sortOrder: number }>; preview: { name: string; displayName: string; description: string; category: string } | null } | null>> {
    try {
      const win = this.getWindow()
      const options: Electron.OpenDialogOptions = {
        title: '选择技能文件夹（含 SKILL.md）',
        properties: ['openDirectory'],
      }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled || !result.filePaths[0]) return ok(null)
      const dir = result.filePaths[0]
      // 定位 SKILL.md（目录根或子目录）
      const skillMd = this.findSkillMd(dir)
      if (!skillMd) {
        return fail('所选文件夹中未找到 SKILL.md')
      }
      const content = readFileSync(skillMd, 'utf-8')
      // 解析预览（安装确认面板用——frontmatter 有 category 则作为默认值）
      let preview: { name: string; displayName: string; description: string; category: string } | null = null
      try {
        const p = parseSkillMarkdown(content)
        preview = { name: p.name ?? '', displayName: p.displayName ?? p.name ?? '', description: p.description ?? '', category: p.category ?? '' }
      } catch {
        preview = null
      }
      // 递归收集附件（references/scripts/templates 等——相对 SKILL.md 目录）
      const baseDir = dirname(skillMd)
      const files: Array<{ fileType: string; name: string; content: string; sortOrder: number }> = []
      const walk = (dirPath: string): void => {
        for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
          if (entry.name === 'SKILL.md') continue
          const full = join(dirPath, entry.name)
          if (entry.isDirectory()) {
            walk(full)
          } else {
            const rel = relative(baseDir, full).replaceAll('\\', '/')
            // fileType = 顶层目录名（references/scripts/templates/其他）
            const top = rel.split('/')[0] ?? 'file'
            const size = statSync(full).size
            if (size > 256 * 1024) continue // 附件单文件上限 256KB（防撑爆上下文）
            try {
              files.push({ fileType: top, name: basename(full), content: readFileSync(full, 'utf-8'), sortOrder: files.length })
            } catch {
              // 二进制/不可读文件跳过（不中断安装）
            }
          }
        }
      }
      walk(baseDir)
      return ok({ path: dir, content, files, preview })
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 在目录（含一层子目录）中定位 SKILL.md */
  private findSkillMd(dir: string): string | null {
    const direct = join(dir, 'SKILL.md')
    if (existsSync(direct)) return direct
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const nested = join(dir, entry.name, 'SKILL.md')
        if (existsSync(nested)) return nested
      }
    }
    return null
  }

  /** 查询激活的技能分类列表（数据源唯一：skill-categories.json——技能表不动态补充） */
  private listSkillCategories(): ApiResponse<unknown> {
    return ok(this.categoryService.findActive())
  }

  /**
   * 安装/创建技能（结构化写入）：render 层已解析 SKILL.md 并允许手动修改，
   * 本接口只做标准数据库写入（校验 name/body 非空 + 重名检查）。
   */
  private installSkill(payload: {
    profile?: string
    name?: string
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
    config?: string
    envVars?: string
    commands?: string
    body?: string
    files?: Array<{ fileType: string; name?: string; content: string; sortOrder?: number }>
    /** 关联技能（frontmatter related: [name...]——按 name 匹配已有技能，写入 private_skill_related） */
    related?: string[]
  }): ApiResponse<SkillInfoVO> {
    const name = (payload?.name ?? '').trim()
    if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
      return fail(`技能 name 缺失或非法（${name || '空'}），需符合小写字母/数字/连字符格式`)
    }
    const body = (payload?.body ?? '').trim()
    if (!body) return fail('技能正文为空')
    // 长度校验（防止撑爆上下文——前后端一致）
    const MAX_BODY = 50 * 1024
    const MAX_FILE = 256 * 1024
    if (body.length > MAX_BODY) {
      return fail(`技能正文过长（${body.length} 字符，上限 ${MAX_BODY}）——请精简正文或拆分为附件`)
    }
    const files = payload?.files ?? []
    for (const f of files) {
      if ((f.content ?? '').length > MAX_FILE) {
        return fail(`附件「${f.name || f.fileType}」过长（${f.content.length} 字符，上限 ${MAX_FILE}）`)
      }
    }
    const profile = payload?.profile ?? 'default'
    const created = this.privateSkillService.createSkill(profile, {
      name,
      displayName: payload.displayName ?? name,
      description: payload.description ?? '',
      category: payload.category ?? '',
      version: payload.version ?? '',
      author: payload.author ?? '',
      license: payload.license ?? '',
      platforms: payload.platforms ?? '',
      tags: payload.tags ?? '',
      dependencies: payload.dependencies ?? '',
      requiresToolsets: payload.requiresToolsets ?? '',
      requiresTools: payload.requiresTools ?? '',
      fallbackForToolsets: payload.fallbackForToolsets ?? '',
      fallbackForTools: payload.fallbackForTools ?? '',
      triggers: payload.triggers ?? '',
      triggerConditions: payload.triggerConditions ?? '',
      config: payload.config ?? '[]',
      commands: payload.commands ?? '',
      envVars: payload.envVars ?? '',
      body,
    })
    if (!created) {
      return fail(`技能已存在: ${name}（同名技能不能重复安装，可改 name 或先删除旧技能）`)
    }
    // 附件入库（references/scripts/templates 等——fileType 区分；顺序保留）
    files.forEach((f, idx) => {
      if (!f.fileType || !f.content) return
      this.privateSkillService.saveSkillFile(created.id, f.fileType, f.content, '', f.sortOrder ?? idx, f.name ?? '')
    })
    // 关联技能写入（frontmatter related: [name...]——按 name 匹配已存在技能；忽略不存在的；不自关联）
    if (payload.related && payload.related.length > 0) {
      for (const relatedName of payload.related) {
        const target = this.privateSkillService.findByName(profile, relatedName.trim())
        if (target && target.id !== created.id) {
          this.privateSkillService.addRelated(created.id, target.id, 'related')
        }
      }
    }
    return ok(toSkillInfoVO(created, true))
  }

  /** 编辑技能（全字段；按 id 定位） */
  private updateSkill(payload: {
    id?: string; profile?: string; displayName?: string; description?: string; category?: string
    version?: string; author?: string; license?: string
    tags?: string; platforms?: string; dependencies?: string; requiresToolsets?: string; requiresTools?: string
    fallbackForToolsets?: string; fallbackForTools?: string; triggers?: string; triggerConditions?: string
    config?: string; envVars?: string; commands?: string; envs?: string; body?: string
    /** 关联技能名数组（编辑时全量替换——清旧写新） */
    related?: string[]
  }): ApiResponse<SkillInfoVO> {
    const id = (payload?.id ?? '').trim()
    const profile = payload?.profile ?? 'default'
    if (!id) return fail('技能 id 为空')
    if (payload?.body && payload.body.length > 50 * 1024) {
      return fail(`技能正文过长（${payload.body.length} 字符，上限 ${50 * 1024}）`)
    }
    const updated = this.privateSkillService.updateSkill(profile, id, {
      displayName: payload.displayName,
      description: payload.description,
      category: payload.category,
      version: payload.version,
      author: payload.author,
      license: payload.license,
      tags: payload.tags,
      platforms: payload.platforms,
      dependencies: payload.dependencies,
      requiresToolsets: payload.requiresToolsets,
      requiresTools: payload.requiresTools,
      fallbackForToolsets: payload.fallbackForToolsets,
      fallbackForTools: payload.fallbackForTools,
      triggers: payload.triggers,
      triggerConditions: payload.triggerConditions,
      config: payload.config,
      envVars: payload.envVars,
      commands: payload.commands,
      envs: payload.envs,
      body: payload.body,
    })
    if (!updated) return fail('技能不存在或更新失败')
    // 关联技能全量替换（清旧写新——按 name 匹配已存在技能）
    this.privateSkillService.clearRelated(id)
    if (payload.related && payload.related.length > 0) {
      for (const relatedName of payload.related) {
        const target = this.privateSkillService.findByName(profile, relatedName.trim())
        if (target && target.id !== id) {
          this.privateSkillService.addRelated(id, target.id, 'related')
        }
      }
    }
    return ok(toSkillInfoVO(updated))
  }

  /** 删除技能（硬删——物理删行 + 级联文件；停用请走 skill:deactivate 软删） */
  private deleteSkill(payload: { id?: string; profile?: string }): ApiResponse<null> {
    const id = (payload?.id ?? '').trim()
    const profile = payload?.profile ?? 'default'
    if (!id) return fail('技能 id 为空')
    const okDel = this.privateSkillService.hardDelete(profile, id)
    if (!okDel) return fail('技能不存在或已删除')
    return ok(null)
  }

  // ── 技能文件（private_skill_files CRUD——按 skill_id 关联） ──

  /** 按技能 id 查文件列表 */
  private listSkillFiles(payload: { skillId?: string }): ApiResponse<unknown> {
    const skillId = (payload?.skillId ?? '').trim()
    if (!skillId) return fail('skillId 为空')
    return ok(this.privateSkillService.listSkillFiles(skillId))
  }

  /** 新增技能文件 */
  private saveSkillFile(payload: { skillId?: string; fileType?: string; name?: string; content?: string; language?: string; sortOrder?: number }): ApiResponse<number> {
    const skillId = (payload?.skillId ?? '').trim()
    if (!skillId) return fail('skillId 为空')
    if (!payload?.fileType?.trim()) return fail('fileType 为空')
    if ((payload.content ?? '').length > 256 * 1024) return fail(`附件内容过长（上限 ${256 * 1024} 字符）`)
    const id = this.privateSkillService.addSkillFile(skillId, {
      fileType: payload.fileType.trim(),
      name: payload.name ?? '',
      content: payload.content ?? '',
      language: payload.language ?? '',
      sortOrder: payload.sortOrder ?? 0,
    })
    return ok(id)
  }

  /** 更新技能文件（按 file id） */
  private updateSkillFile(payload: { id?: number; fileType?: string; name?: string; content?: string; language?: string; sortOrder?: number }): ApiResponse<null> {
    const id = payload?.id
    if (id === undefined || id < 0) return fail('文件 id 无效')
    if ((payload.content ?? '').length > 256 * 1024) return fail(`附件内容过长（上限 ${256 * 1024} 字符）`)
    const okUpdate = this.privateSkillService.updateSkillFile(id, {
      fileType: payload.fileType,
      name: payload.name,
      content: payload.content,
      language: payload.language,
      sortOrder: payload.sortOrder,
    })
    return okUpdate ? ok(null) : fail('文件不存在或更新失败')
  }

  /** 删除技能文件（按 file id） */
  private deleteSkillFile(payload: { id?: number }): ApiResponse<null> {
    const id = payload?.id
    if (id === undefined || id < 0) return fail('文件 id 无效')
    return this.privateSkillService.deleteSkillFile(id) ? ok(null) : fail('文件不存在或删除失败')
  }
}

/**
 * 解析外部 SKILL.md：frontmatter（--- ... ---）→ 元数据，正文 → body。
 * 兼容标准 skill 格式（name/description 必填）；不兼容返回 ok=false。
 */
function parseSkillMarkdown(content: string): {
  ok: boolean
  error?: string
  name?: string
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
  body: string
} {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(content)
  if (!m) {
    return { ok: false, error: '技能缺少 frontmatter（--- 元数据 ---），无法识别，请交给 Agent 重写', body: content }
  }
  const frontmatter = m[1]
  const body = (m[2] ?? '').trim()
  const fields: Record<string, string> = {}
  for (const line of frontmatter.split('\n')) {
    const kv = /^([a-zA-Z_]+):\s*(.*)$/.exec(line.trim())
    if (kv) fields[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
  }
  const name = fields.name
  if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    return { ok: false, error: `技能 name 缺失或非法（${name ?? '空'}），请交给 Agent 重写`, body: content }
  }
  if (!fields.description) {
    return { ok: false, error: '技能缺少 description，请交给 Agent 重写', body: content }
  }
  if (!body) {
    return { ok: false, error: '技能正文为空，请交给 Agent 重写', body: content }
  }
  return {
    ok: true,
    name,
    displayName: fields.displayName ?? fields['display_name'] ?? name,
    description: fields.description,
    category: fields.category,
    version: fields.version,
    author: fields.author,
    license: fields.license,
    platforms: fields.platforms ?? fields.os,
    tags: fields.tags,
    dependencies: fields.dependencies,
    requiresToolsets: fields.requires_toolsets ?? fields.requiresToolsets,
    requiresTools: fields.requires_tools ?? fields.requiresTools,
    fallbackForToolsets: fields.fallback_for_toolsets ?? fields.fallbackForToolsets,
    fallbackForTools: fields.fallback_for_tools ?? fields.fallbackForTools,
    triggers: fields.triggers,
    triggerConditions: fields.trigger_conditions ?? fields.triggerConditions,
    commands: fields.commands,
    envVars: fields.env_vars ?? fields.envVars,
    body,
  }
}
