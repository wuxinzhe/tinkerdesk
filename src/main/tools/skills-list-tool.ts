/**
 * skills-list-tool.ts — 技能列表工具
 *
 * 复刻 tinker-agent SkillsListTool：
 * 列出可用技能，按分类分组，渲染 skills-list.hbs 模板。
 */
import type { PromptRenderer } from '../core/prompt/renderer'
import type { PrivateSkillService } from '../service/private-skill-service'
import { BaseTool } from './base-tool'
import { ToolResult } from '../core/tool/tool-result'
import type { ToolContext } from '../core/loop/types'

/** 工具名 */
export const TOOL_NAME = 'builtin_tinker_skills_list'

/** 技能列表工具 */
export class SkillsListTool extends BaseTool {
  private readonly skillService: PrivateSkillService

  constructor(renderer: PromptRenderer, skillService: PrivateSkillService) {
    super(renderer, TOOL_NAME)
    this.skillService = skillService
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const args = (ctx.toolCall.arguments ?? {}) as Record<string, unknown>
    const categoryFilter = String(args.category ?? '').trim()
    const showDisabled = Boolean(args.show_disabled)
    const osFilter = args.os ? String(args.os).trim() : ctx.clientEnv?.os ?? ''
    const typeFilter = args.type ? String(args.type).trim() : ctx.clientEnv?.clientType ?? ''

    const skills = this.skillService.listSkills(ctx.profile)
    if (skills.length === 0) {
      return ToolResult.sync(showDisabled ? 'No skills found (including disabled).' : 'No skills available. Use skill_manage to create one.')
    }

    // 按 category 分组（对齐 Java：os/type 平台筛选 + readinessStatus）
    const byCategory = new Map<string, Array<Record<string, unknown>>>()
    let totalCount = 0
    for (const s of skills) {
      if (categoryFilter && categoryFilter !== s.category) continue
      // 平台/客户端筛选（对齐 Java listSkills(os, type)）
      if (s.platforms && s.platforms.trim() !== '' && !s.platforms.split(',').map(p => p.trim()).some(p => p === osFilter)) continue
      if (s.requiresToolsets && s.requiresToolsets.trim() !== '' && !s.requiresToolsets.split(',').map(t => t.trim()).some(t => t === typeFilter)) continue

      const cat = s.category || 'uncategorized'
      if (!byCategory.has(cat)) byCategory.set(cat, [])
      const item: Record<string, unknown> = {
        name: s.name,
      }
      // 非 available 才输出 readinessStatus（对齐 Java）
      const readiness = s.apiKey ? 'available' : 'setup_needed'
      if (readiness !== 'available') {
        item.readinessStatus = readiness
      }
      if (s.description) {
        item.description = this.truncate(s.description, 80)
      }
      if (s.tags && s.tags.trim() !== '') {
        item.tags = s.tags
      }
      if (s.version) {
        item.version = s.version
      }
      byCategory.get(cat)!.push(item)
      totalCount++
    }
    if (byCategory.size === 0) {
      return ToolResult.sync(`No skills found for category '${categoryFilter}'.`)
    }

    // 构建模板上下文
    const categories: Array<{ category: string; count: number; skills: Array<Record<string, unknown>> }> = []
    for (const [cat, catSkills] of [...byCategory.entries()].sort()) {
      categories.push({ category: cat, count: catSkills.length, skills: catSkills })
    }
    const categoriesList = [...byCategory.keys()].sort().join(', ')

    const result = this.renderer.render('skills-list', {
      categories,
      totalCount,
      categoryFilter: categoryFilter || undefined,
      categoriesList,
    }).trim()
    return ToolResult.sync(result)
  }

  /** 截断描述（对齐 Java truncate 80） */
  private truncate(text: string, maxLen: number): string {
    if (!text) return ''
    if (text.length <= maxLen) return text
    return text.substring(0, maxLen - 3) + '...'
  }
}
