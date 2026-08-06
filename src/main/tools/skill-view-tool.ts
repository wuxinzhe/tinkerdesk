/**
 * skill-view-tool.ts — 技能查看工具
 *
 * 复刻 tinker-agent SkillViewTool：
 * 查看技能详情，渲染 skill-view.hbs 模板。
 */
import type { PromptRenderer } from '../core/prompt/renderer'
import type { PrivateSkillService } from '../service/private-skill-service'
import { BaseTool } from './base-tool'
import { ToolResult } from '../core/tool/tool-result'
import type { ToolContext } from '../core/loop/types'

/** 工具名 */
export const TOOL_NAME = 'builtin_tinker_skill_view'

/** 技能查看工具 */
export class SkillViewTool extends BaseTool {
  private readonly skillService: PrivateSkillService

  constructor(renderer: PromptRenderer, skillService: PrivateSkillService) {
    super(renderer, TOOL_NAME)
    this.skillService = skillService
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const args = (ctx.toolCall.arguments ?? {}) as Record<string, unknown>
    const name = String(args.name ?? '').trim()
    if (!name) {
      return ToolResult.sync('Error: Skill name is required.')
    }

    const detail = this.skillService.viewSkill(ctx.profile, name)
    if (!detail) {
      return ToolResult.sync(`Error: Skill '${name}' not found. Use skills_list to see available skills.`)
    }

    // 渲染 skill-view.hbs（对齐 Java：全部字段 + metaLine 含 Category/Updated/Readiness）
    const templateCtx: Record<string, unknown> = { name: detail.name }
    if (detail.description) templateCtx.description = detail.description
    if (detail.body) templateCtx.body = detail.body
    if (detail.tags) templateCtx.tags = detail.tags
    const metaParts: string[] = []
    if (detail.category) metaParts.push(`**Category:** ${detail.category}`)
    if (detail.updatedAt) metaParts.push(`**Updated:** ${detail.updatedAt}`)
    metaParts.push(`**Readiness:** ${detail.apiKey ? 'available' : 'setup_needed'}`)
    templateCtx.metaLine = metaParts.join(' | ')
    if (detail.platforms) templateCtx.oss = detail.platforms
    if (detail.dependencies) templateCtx.dependencies = detail.dependencies
    if (detail.requiresToolsets) templateCtx.requiresToolsets = detail.requiresToolsets
    if (detail.requiresTools) templateCtx.requiresTools = detail.requiresTools
    if (detail.fallbackForToolsets) templateCtx.fallbackForToolsets = detail.fallbackForToolsets
    if (detail.fallbackForTools) templateCtx.fallbackForTools = detail.fallbackForTools
    if (detail.triggers) templateCtx.triggers = detail.triggers
    if (detail.triggerConditions) templateCtx.triggerConditions = detail.triggerConditions
    if (detail.config) templateCtx.config = detail.config
    if (detail.apiKey) templateCtx.apiKey = this.maskApiKey(detail.apiKey)
    if (detail.envVars) templateCtx.envVars = detail.envVars
    if (detail.commands) templateCtx.commands = detail.commands

    const result = this.renderer.render('skill-view', templateCtx).trim()
    return ToolResult.sync(result)
  }

  /** 掩码 API key（前4+后4可见） */
  private maskApiKey(key: string): string {
    if (key.length <= 8) return '****'
    return key.substring(0, 4) + '****' + key.substring(key.length - 4)
  }
}
