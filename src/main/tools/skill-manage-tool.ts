/**
 * skill-manage-tool.ts — 技能管理工具
 *
 * 复刻 showing-agent SkillManageTool：
 * create / patch / edit / delete / write_file / remove_file 六种操作。
 */
import type {PromptRenderer} from '../prompt/renderer'
import {BaseTool} from './base-tool'
import type {ToolExecutionContext} from './types'
import {ToolResult} from './tool-result'
import type {PrivateSkillService} from '../service/private-skill-service'
import {PrivateSkillFileRepository} from '../repository/private-skill-file-repository'

/** 工具名 */
export const TOOL_NAME = 'server_showing_skill_manage'

/** 技能内容最大字符数（对齐 MAX_SKILL_CHARS） */
const MAX_SKILL_CHARS = 50000

/** 技能管理工具 */
export class SkillManageTool extends BaseTool {
  private readonly skillService: PrivateSkillService
  private readonly fileRepo: PrivateSkillFileRepository

  constructor(renderer: PromptRenderer, skillService: PrivateSkillService, fileRepo: PrivateSkillFileRepository) {
    super(renderer, TOOL_NAME)
    this.skillService = skillService
    this.fileRepo = fileRepo
  }

  async execute(ctx: ToolExecutionContext): Promise<ToolResult> {
    const args = (ctx.toolCall.arguments ?? {}) as Record<string, unknown>
    const action = String(args.action ?? '')
    const name = String(args.name ?? '')
    const profile = ctx.profile

    if (!action || !name) {
      return ToolResult.sync(this.jsonError('action and name are required.'))
    }

    let result: string
    switch (action) {
      case 'create':
        result = this.handleCreate(name, args, profile)
        break
      case 'patch':
        result = this.handlePatch(name, args, profile)
        break
      case 'edit':
        result = this.handleEdit(name, args, profile)
        break
      case 'delete':
        result = this.handleDelete(name, profile)
        break
      case 'write_file':
        result = this.handleWriteFile(name, args, profile)
        break
      case 'remove_file':
        result = this.handleRemoveFile(name, args, profile)
        break
      default:
        result = this.jsonError(`Unknown action: ${action}. Use: create, patch, edit, delete, write_file, remove_file`)
    }
    return ToolResult.sync(result)
  }

  // ── 操作处理器 ──

  private handleCreate(name: string, args: Record<string, unknown>, profile: string): string {
    const nameErr = this.validateName(name)
    if (nameErr) return this.jsonError(nameErr)
    if (this.skillService.countByName(profile, name) > 0) {
      return this.jsonError(`Skill already exists: ${name}. Use 'edit' or 'patch' to modify it.`)
    }
    const body = String(args.body ?? '')
    if (!body) {
      return this.jsonError("body is required for 'create'. Provide the full skill markdown content.")
    }
    if (body.length > MAX_SKILL_CHARS) {
      return this.jsonError(`Skill content exceeds ${MAX_SKILL_CHARS} characters.`)
    }
    const created = this.skillService.createSkill(profile, {
      name,
      description: String(args.description ?? ''),
      category: String(args.category ?? ''),
      body,
      apiKey: args.api_key ? String(args.api_key) : null,
    })
    if (!created) {
      return this.jsonError(`Skill already exists: ${name}.`)
    }
    return JSON.stringify({success: true, message: `Skill '${name}' created.`, id: created.id})
  }

  private handlePatch(name: string, args: Record<string, unknown>, profile: string): string {
    const oldStr = String(args.old_string ?? '')
    const newStr = String(args.new_string ?? '')
    const replaceAll = Boolean(args.replace_all)
    if (!oldStr) {
      return this.jsonError("old_string is required for 'patch'.")
    }
    const detail = this.skillService.viewSkill(profile, name)
    if (!detail) {
      return this.jsonError(`Skill not found: ${name} (not installed or user-scoped).`)
    }
    const body = detail.body
    if (!body || !body.includes(oldStr)) {
      return JSON.stringify({
        success: false,
        error: 'old_string not found in skill body. Check the current content with skill_view(name) and retry.',
        file_preview: (body ?? '').substring(0, Math.min(500, body?.length ?? 0)) + ((body?.length ?? 0) > 500 ? '...' : ''),
      })
    }
    const newBody = replaceAll ? body.split(oldStr).join(newStr) : body.replace(oldStr, newStr)
    if (newBody === body) {
      return this.jsonError('Patch did not change anything.')
    }
    this.skillService.updateSkillBody(profile, detail.id, newBody)
    return JSON.stringify({success: true, message: `Skill '${name}' patched.`, id: detail.id})
  }

  private handleEdit(name: string, args: Record<string, unknown>, profile: string): string {
    const detail = this.skillService.viewSkill(profile, name)
    if (!detail) {
      return this.jsonError(`Skill not found: ${name} (not installed or user-scoped).`)
    }
    const body = String(args.body ?? '')
    if (!body) {
      return this.jsonError("body is required for 'edit'. Provide the full skill markdown content.")
    }
    if (body.length > MAX_SKILL_CHARS) {
      return this.jsonError(`Skill content exceeds ${MAX_SKILL_CHARS} characters.`)
    }
    this.skillService.updateSkillBody(profile, detail.id, body)
    return JSON.stringify({success: true, message: `Skill '${name}' edited.`, id: detail.id})
  }

  private handleDelete(name: string, profile: string): string {
    const detail = this.skillService.viewSkill(profile, name)
    if (!detail) {
      return this.jsonError(`Skill not found: ${name}.`)
    }
    this.skillService.softDelete(profile, detail.id)
    return JSON.stringify({success: true, message: `Skill '${name}' deleted.`})
  }

  private handleWriteFile(name: string, args: Record<string, unknown>, profile: string): string {
    const detail = this.skillService.viewSkill(profile, name)
    if (!detail) {
      return this.jsonError(`Skill not found: ${name}.`)
    }
    const fileType = String(args.file_type ?? '')
    const content = String(args.content ?? '')
    const language = String(args.language ?? '')
    const sortOrder = typeof args.sort_order === 'number' ? args.sort_order : 0
    if (!fileType) {
      return this.jsonError("file_type is required for 'write_file'.")
    }
    this.fileRepo.save({skillId: detail.id, fileType, content, language, sortOrder})
    return JSON.stringify({success: true, message: `File '${fileType}' written to skill '${name}'.`})
  }

  private handleRemoveFile(name: string, args: Record<string, unknown>, profile: string): string {
    const detail = this.skillService.viewSkill(profile, name)
    if (!detail) {
      return this.jsonError(`Skill not found: ${name}.`)
    }
    const fileType = String(args.file_type ?? '')
    if (!fileType) {
      return this.jsonError("file_type is required for 'remove_file'.")
    }
    this.fileRepo.deleteBySkillIdAndFileType(detail.id, fileType)
    return JSON.stringify({success: true, message: `File '${fileType}' removed from skill '${name}'.`})
  }

  // ── 工具方法 ──

  /** 校验技能名（对齐 validateName） */
  private validateName(name: string): string | null {
    if (!name || !name.trim()) {
      return 'Skill name is required.'
    }
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(name)) {
      return 'Skill name must start with a lowercase letter or digit, and contain only lowercase letters, digits, hyphens, and underscores.'
    }
    if (name.length > 64) {
      return 'Skill name must be 64 characters or fewer.'
    }
    return null
  }

  private jsonError(msg: string): string {
    return JSON.stringify({success: false, error: msg})
  }
}
