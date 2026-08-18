/**
 * skills-index-module.ts — 技能索引模块
 *
 * SkillsIndexModule:
 * When skill_view / skills_list / skill_manage tools are available, queries
 * the available skill list, groups by category and formats an index text.
 */
import type {ConversationContext} from '../../core/prompt/types'
import type {PromptRenderer} from '../../core/prompt/renderer'
import {HandlebarsPresetModule} from './preset-module'
import type {FilteredSkillDTO} from '../../repository/types'
import {TOOL_SKILL_MANAGE, TOOL_SKILL_VIEW, TOOL_SKILLS_LIST} from '../../core/constants'

/** 技能索引模块 */
export class SkillsIndexModule extends HandlebarsPresetModule {
  readonly id = 'skills-index'

  constructor(
    renderer: PromptRenderer,
    private readonly findFiltered: (profile: string) => FilteredSkillDTO[]
  ) {
    super(renderer)
  }

  override shouldLoad(ctx: ConversationContext): boolean {
    const names = ctx.toolNames ?? []
    return (
      names.includes(TOOL_SKILLS_LIST) ||
      names.includes(TOOL_SKILL_VIEW) ||
      names.includes(TOOL_SKILL_MANAGE)
    )
  }

  override loadPrompt(ctx: ConversationContext): string | null {
    try {
      const filtered = this.findFiltered(ctx.profile)
      if (!filtered || filtered.length === 0) {
        return null
      }
      // 按 category 分组，描述截断 60 字符；id 随行（skill_view 唯一指向）
      const categories: Record<string, Array<{name: string; id: string; description: string}>> = {}
      for (const skill of filtered) {
        const cat = skill.category || 'general'
        if (!categories[cat]) {
          categories[cat] = []
        }
        categories[cat].push({
          name: skill.name,
          id: skill.id,
          description: this.truncate(skill.description, 60),
        })
      }
      const result = this.renderer.render('skills-index', {categories})
      return result && result.trim() !== '' ? result : null
    } catch {
      return null
    }
  }

  private truncate(text: string, maxLen: number): string {
    if (!text) {
      return ''
    }
    if (text.length <= maxLen) {
      return text
    }
    return text.substring(0, maxLen - 3) + '...'
  }
}
