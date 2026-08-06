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
    ipcMain.handle('skill:install', (_event, payload) => this.installSkill(payload))
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

  /**
   * 安装技能（外部导入）：先校验格式兼容性。
   * 外部 skill（SKILL.md 全文，可能带 frontmatter）→ 校验 name/description 齐全 →
   * 转换（frontmatter 字段入表，body 存纯正文）→ 创建。
   * 格式不兼容 → 返回 reason=incompatible，提示用户交给 Agent 重写。
   */
  private installSkill(payload: { content?: string; profile?: string }): ApiResponse<SkillInfoVO> {
    const content = (payload?.content ?? '').trim()
    if (!content) return fail('技能内容为空')
    const parsed = parseSkillMarkdown(content)
    if (!parsed.ok) {
      return fail(parsed.error ?? '技能格式不兼容（缺少 name/description），请交给 Agent 重写')
    }
    const profile = payload?.profile ?? 'default'
    const created = this.privateSkillService.createSkill(profile, {
      name: parsed.name!,
      displayName: parsed.displayName,
      description: parsed.description ?? '',
      category: parsed.category ?? '',
      body: parsed.body,
    })
    if (!created) {
      return fail(`技能已存在: ${parsed.name}`)
    }
    return ok(toSkillInfoVO(created, true))
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
    if (kv) fields[kv[1]] = kv[2].trim()
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
    body,
  }
}
