/**
 * skill-parser.ts — render 层 SKILL.md 解析器（与后端 parseSkillMarkdown 同构）
 *
 * 安装流程重构后：解析全部在前端做，解析结果（结构化字段）可手动修改后通过
 * 标准写入 IPC 入库。frontmatter 字段 + 纯正文分离。
 */

export interface ParsedSkill {
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
  /** 关联技能名数组（frontmatter related: [name...]——导入时按 name 匹配写入关联） */
  related?: string[]
  triggerConditions?: string
  commands?: string
  envVars?: string
  config?: string
  compatibility?: string
  allowedTools?: string
  metadata?: string
  body: string
}

/** 解析 SKILL.md（frontmatter → 字段；正文 → body） */
export function parseSkillMarkdown(content: string): ParsedSkill {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(content)
  if (!m) {
    return { ok: false, error: '技能缺少 frontmatter（--- 元数据 ---），无法识别，请交给 Agent 重写', body: content }
  }
  const frontmatter = m[1]
  const body = (m[2] ?? '').trim()
  const fields: Record<string, string> = {}
  for (const line of frontmatter.split('\n')) {
    const kv = /^([a-zA-Z_]+):\s*(.*)$/.exec(line.trim())
    // 数组字段（tags/platforms 等）的 YAML 方括号语法在解析层剥掉——存储层不背锅
    if (kv) fields[kv[1]] = kv[2].trim().replace(/^\[/, '').replace(/\]$/, '').replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
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
    compatibility: fields.compatibility,
    allowedTools: fields.allowed_tools ?? fields.allowedTools,
    metadata: fields.metadata,
    config: fields.config ?? '[]',
    // related 是数组语义（frontmatter related: [a, b]）——逗号拆分
    related: fields.related
      ? fields.related.split(',').map((x: string) => x.trim()).filter(Boolean)
      : undefined,
    body,
  }
}

/** 安装文件类型（与后端 pickInstallFile 的目录识别一致） */
export const SKILL_FILE_TYPES = ['references', 'scripts', 'templates', 'assets', 'other'] as const
