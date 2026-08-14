/**
 * skill-view-tool.ts — 技能查看工具
 *
 * SkillViewTool：
 * 查看技能详情，渲染 skill-view.hbs 模板。
 */
import type { PromptRenderer } from '../core/prompt/renderer'
import type { PrivateSkillService } from '../service/private-skill-service'
import { BaseTool } from './base-tool'
import { ToolResult } from '../core/tool/tool-result'
import type { ToolContext } from '../core/loop/types'
import { TOOL_SKILL_VIEW } from '../core/constants'

/** 工具名 */
export const TOOL_NAME = TOOL_SKILL_VIEW

/** 技能查看工具 */
export class SkillViewTool extends BaseTool {
  private readonly skillService: PrivateSkillService

  constructor(renderer: PromptRenderer, skillService: PrivateSkillService) {
    super(renderer, TOOL_NAME)
    this.skillService = skillService
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const args = (ctx.toolCall.arguments ?? {}) as Record<string, unknown>
    // 寻址：id 优先；id 缺失时 name 兜底（兼容外部技能正文 skill_view(name=...) 引用——导入即用无需回填）
    let id = String(args.id ?? '').trim()
    if (!id) {
      const name = String(args.name ?? '').trim()
      if (name) {
        const byName = this.skillService.findByName(ctx.profile, name)
        if (!byName) {
          return ToolResult.sync(`Error: Skill '${name}' not found by name. Use skills_list to see available skills.`)
        }
        id = byName.id
      } else {
        return ToolResult.sync('Error: Skill id (or name) is required. Use skills_list to get the id.')
      }
    }

    // 按 fileId 加载单个技能文件内容（skill_view(id, fileId)——索引后按需取内容）
    const fileId = args.fileId !== undefined && args.fileId !== null ? Number(args.fileId) : undefined
    if (fileId !== undefined && !Number.isNaN(fileId)) {
      const file = this.skillService.getSkillFileById(fileId)
      if (!file) {
        return ToolResult.sync(`Error: Skill file '${fileId}' not found. Use skill_view(id) to list files.`)
      }
      return ToolResult.sync(`# File: ${file.name || file.fileType} (id: ${file.id})\n\n${file.content}`)
    }

    const detail = this.skillService.viewSkillById(ctx.profile, id)
    if (!detail) {
      return ToolResult.sync(`Error: Skill '${id}' not found. Use skills_list to see available skills.`)
    }

    // 渲染 skill-view.hbs
    const templateCtx: Record<string, unknown> = { name: detail.name, id: detail.id }
    if (detail.description) templateCtx.description = detail.description
    if (detail.body) templateCtx.body = detail.body
    if (detail.tags) templateCtx.tags = detail.tags
    // 附件索引（按 sort_order 排序——id/name/fileType/language；content 用 fileId 按需加载）
    if (detail.files && detail.files.length > 0) {
      templateCtx.files = [...detail.files]
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((f) => ({
          id: f.id,
          name: f.name || f.fileType,
          fileType: f.fileType,
          language: f.language,
          sortOrder: f.sortOrder,
        }))
    }
    // 关联技能（嵌套/关联——模型可继续 skill_view(id=...) 查看——像 files 引用）
    if (detail.related && detail.related.length > 0) {
      templateCtx.related = detail.related
    }
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
