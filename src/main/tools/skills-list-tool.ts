/**
 * skills-list-tool.ts — 技能列表工具
 *
 * 复刻 showing-agent SkillsListTool：
 * 列出可用技能，按分类分组，渲染 skills-list.hbs 模板。
 */
import type {PromptRenderer} from '../prompt/renderer'
import {BaseTool} from './base-tool'
import type {ToolExecutionContext} from './types'
import {ToolResult} from './tool-result'
import type {PrivateSkillService} from '../service/private-skill-service'

/** 工具名 */
export const TOOL_NAME = 'server_showing_skills_list'

/** 技能列表工具 */
export class SkillsListTool extends BaseTool {
  private readonly skillService: PrivateSkillService

  constructor(renderer: PromptRenderer, skillService: PrivateSkillService) {
    super(renderer, TOOL_NAME)
    this.skillService = skillService
  }

  async execute(ctx: ToolExecutionContext): Promise<ToolResult> {
    const args = (ctx.toolCall.arguments ?? {}) as Record<string, unknown>
    const categoryFilter = String(args.category ?? '').trim()
    const showDisabled = Boolean(args.show_disabled)

    const skills = this.skillService.listSkills(ctx.profile)
    if (skills.length === 0) {
      return ToolResult.sync(showDisabled ? 'No skills found (including disabled).' : 'No skills available. Use skill_manage to create one.')
    }

    // 按 category 分组
    const byCategory = new Map<string, Array<Record<string, unknown>>>()
    let totalCount = 0
    for (const s of skills) {
      if (categoryFilter && categoryFilter !== s.category) continue
      const cat = s.category || 'uncategorized'
      if (!byCategory.has(cat)) byCategory.set(cat, [])
      byCategory.get(cat)!.push({
        name: s.name,
        description: s.description,
        version: s.version,
      })
      totalCount++
    }
    if (byCategory.size === 0) {
      return ToolResult.sync(`No skills found for category '${categoryFilter}'.`)
    }

    // 构建模板上下文
    const categories: Array<{category: string; count: number; skills: Array<Record<string, unknown>>}> = []
    for (const [cat, catSkills] of [...byCategory.entries()].sort()) {
      categories.push({category: cat, count: catSkills.length, skills: catSkills})
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
}
