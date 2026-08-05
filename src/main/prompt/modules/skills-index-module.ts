/**
 * skills-index-module.ts — 技能索引模块
 *
 * 复刻 showing-agent SkillsIndexModule：
 * 当 skill_view / skills_list / skill_manage 工具可用时，
 * 查询可用技能列表，按类别分组并格式化为索引文本。
 */
import type {PromptContext} from '../types'
import type {PromptRenderer} from '../renderer'
import {HandlebarsPresetModule} from './preset-module'
import type {FilteredSkillDTO} from '../../repository/types'

/** 技能索引模块 */
export class SkillsIndexModule extends HandlebarsPresetModule {
  readonly id = 'skills-index'

  constructor(
    renderer: PromptRenderer,
    private readonly findFiltered: (profile: string) => FilteredSkillDTO[]
  ) {
    super(renderer)
  }

  override shouldLoad(ctx: PromptContext): boolean {
    const names = ctx.toolNames ?? []
    return (
      names.includes('showing_skills_list') ||
      names.includes('showing_skill_view') ||
      names.includes('showing_skill_manage')
    )
  }

  override loadPrompt(ctx: PromptContext): string | null {
    try {
      const filtered = this.findFiltered(ctx.profile)
      if (!filtered || filtered.length === 0) {
        return null
      }
      // 按 category 分组，描述截断 60 字符
      const categories: Record<string, Array<{name: string; description: string}>> = {}
      for (const skill of filtered) {
        const cat = skill.category || 'general'
        if (!categories[cat]) {
          categories[cat] = []
        }
        categories[cat].push({
          name: skill.name,
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
