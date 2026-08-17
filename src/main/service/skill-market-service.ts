/**
 * skill-market-service.ts — 技能市场（npm 在线——keywords:tinkerdesk-skill）
 *
 * 参照插件市场（plugin-market-service）三层模式：
 *   repository：npm registry 真实搜索/详情（复用 npm-registry-repository）
 *   service：列表（含已装标记）+ 安装（tarball 下载 → 解压 → SKILL.md 解析 → 入库）
 * 包规范：npm 包名 tinkerdesk-skill-<name>；package.json keywords 含 "tinkerdesk-skill"；
 *   SKILL.md 在包根（frontmatter + 正文）；references/scripts 附件随包。
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { execFileAsync, downloadWithMirror } from '../utils/process-utils'
import { getPackageDetail, searchNpm, type NpmPackage } from '../repository/npm-registry-repository'

/** 技能包前缀（市场生态限定） */
export const SKILL_MARKET_PREFIX = 'tinkerdesk-skill-'
/** 官方维护者 */
export const OFFICIAL_MAINTAINER = 'wuxinzhe'
/** 技能分类词（keywords 承载——与插件市场同款约定） */
export const SKILL_MARKET_CATEGORIES = ['agent', 'productivity', 'voice', 'video', 'game', 'code', 'creative', 'research']

/** 技能市场条目（controller → renderer） */
export interface SkillMarketItem {
  name: string
  version: string
  description: string
  updated: string
  official: boolean
  installed: boolean
  categories: string[]
}

/** 技能市场安装结果 */
export interface SkillMarketInstallResult {
  ok: boolean
  error?: string
  skillId?: string
  name?: string
}

/** 查询 npm registry（生态 + 官方兜底——带分类/搜索词——与插件市场同构） */
async function queryNpm(category?: string, search?: string, maintainer?: string): Promise<NpmPackage[]> {
  const parts: string[] = []
  if (maintainer) parts.push(`maintainer:${maintainer}`)
  parts.push('keywords:tinkerdesk-skill')
  if (category) parts.push(`keywords:${category}`)
  if (search && search.trim()) parts.push(search.trim())
  const res = await searchNpm({ text: parts.join(' ') })
  return (res.objects ?? []).map((o) => o.package)
}

/** 市场列表（真实 npm 查询——合并生态+官方——去重——前缀过滤） */
export async function listSkillMarket(params: { installedNames: string[]; category?: string; search?: string }): Promise<{ items: SkillMarketItem[] }> {
  const [eco, official] = await Promise.all([
    queryNpm(params.category, params.search),
    queryNpm(params.category, params.search, OFFICIAL_MAINTAINER),
  ])
  const map = new Map<string, NpmPackage>()
  for (const p of [...eco, ...official]) {
    if (!map.has(p.name)) map.set(p.name, p)
  }
  const items = Array.from(map.values())
    .filter((p) => p.name.startsWith(SKILL_MARKET_PREFIX))
    .map((p) => ({
      name: p.name,
      version: p.version,
      description: p.description ?? '',
      updated: p.date ?? '',
      official: (p.maintainers ?? []).some((m) => m.username === OFFICIAL_MAINTAINER),
      installed: params.installedNames.includes(p.name.slice(SKILL_MARKET_PREFIX.length)),
      categories: (p.keywords ?? []).filter((k) => SKILL_MARKET_CATEGORIES.includes(k)),
    }))
    .sort((a, b) => {
      if (a.official !== b.official) return a.official ? -1 : 1
      return (b.updated ?? '').localeCompare(a.updated ?? '')
    })
  return { items }
}

/** 解析 SKILL.md frontmatter（轻量——name/description 必填；其余字段透传字符串） */
export function parseSkillFrontmatter(content: string): { ok: boolean; error?: string; name?: string; fields: Record<string, string>; body: string } {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(content)
  if (!m) return { ok: false, error: '缺少 frontmatter', fields: {}, body: content }
  const fields: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const kv = /^([a-zA-Z_]+):\s*(.*)$/.exec(line.trim())
    if (kv) fields[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
  }
  if (!fields.name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fields.name)) {
    return { ok: false, error: `name 缺失或非法（${fields.name ?? '空'}）`, fields, body: (m[2] ?? '').trim() }
  }
  if (!fields.description) return { ok: false, error: '缺少 description', fields, body: (m[2] ?? '').trim() }
  return { ok: true, name: fields.name, fields, body: (m[2] ?? '').trim() }
}

/**
 * 安装技能包（npm tarball → 解压 → SKILL.md 解析 → 入库回调）
 * @param pkgName npm 包名（tinkerdesk-skill-xxx）
 * @param doInstall 入库回调（service 层注入——由 controller 的 skill 服务执行事务写入）
 */
export async function installSkillFromNpm(
  pkgName: string,
  doInstall: (payload: {
    name: string
    displayName?: string
    description: string
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
    compatibility?: string
    allowedTools?: string
    metadata?: string
    body: string
    files?: Array<{ fileType: string; name?: string; content: string; sortOrder?: number }>
    related?: string[]
  }) => { ok: boolean; error?: string; id?: string },
): Promise<SkillMarketInstallResult> {
  if (!pkgName.startsWith(SKILL_MARKET_PREFIX)) {
    return { ok: false, error: `非技能市场包（需 ${SKILL_MARKET_PREFIX} 前缀）` }
  }
  const tmpDir = join(app.getPath('temp'), `tinkerdesk-skill-${Date.now()}`)
  try {
    const detail = await getPackageDetail(pkgName)
    const tarball = (detail as { dist?: { tarball?: string } }).dist?.tarball
    if (!tarball) return { ok: false, error: 'npm 包无 tarball 地址' }
    mkdirSync(tmpDir, { recursive: true })
    const tgz = join(tmpDir, 'pkg.tgz')
    await downloadWithMirror(tarball, tgz)
    const extracted = join(tmpDir, 'pkg')
    mkdirSync(extracted, { recursive: true })
    // Windows 用 System32 tar
    const tarBin = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
    await execFileAsync(tarBin, ['-xf', tgz, '-C', extracted])
    // 定位 SKILL.md（根或一层子目录）
    const root = readdirSync(extracted).find((n) => n.endsWith('package')) ? join(extracted, 'package') : extracted
    const skillFile = join(root, 'SKILL.md')
    if (!existsSync(skillFile)) return { ok: false, error: '包内未找到 SKILL.md' }
    const { readFileSync } = await import('fs')
    const parsed = parseSkillFrontmatter(readFileSync(skillFile, 'utf-8'))
    if (!parsed.ok || !parsed.name) return { ok: false, error: `SKILL.md 解析失败: ${parsed.error ?? '未知'}` }
    // 附件（references/scripts/templates）
    const files: Array<{ fileType: string; name?: string; content: string; sortOrder?: number }> = []
    let sort = 0
    const collect = (dir: string, fileType: string): void => {
      if (!existsSync(dir)) return
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        const stat = require('fs').statSync(p)
        if (stat.isDirectory()) collect(p, fileType)
        else {
          const content = require('fs').readFileSync(p, 'utf-8')
          if (content.length <= 256 * 1024) files.push({ fileType, name, content, sortOrder: sort++ })
        }
      }
    }
    collect(join(root, 'references'), 'reference')
    collect(join(root, 'scripts'), 'script')
    collect(join(root, 'templates'), 'template')
    const f = parsed.fields
    const result = doInstall({
      name: parsed.name,
      displayName: f.displayName ?? f['display_name'] ?? parsed.name,
      description: f.description,
      category: f.category,
      version: f.version,
      author: f.author,
      license: f.license,
      platforms: f.platforms ?? f.os,
      tags: f.tags,
      dependencies: f.dependencies,
      requiresToolsets: f.requires_toolsets ?? f.requiresToolsets,
      requiresTools: f.requires_tools ?? f.requiresTools,
      fallbackForToolsets: f.fallback_for_toolsets ?? f.fallbackForToolsets,
      fallbackForTools: f.fallback_for_tools ?? f.fallbackForTools,
      triggers: f.triggers,
      triggerConditions: f.trigger_conditions ?? f.triggerConditions,
      config: f.config ?? '[]',
      envVars: f.env_vars ?? f.envVars,
      commands: f.commands,
      compatibility: f.compatibility,
      allowedTools: f.allowed_tools ?? f.allowedTools,
      metadata: f.metadata ?? '{}',
      body: parsed.body,
      files,
      related: (f.related ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    })
    return result.ok ? { ok: true, skillId: result.id, name: parsed.name } : { ok: false, error: result.error ?? '安装失败' }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}


/** 技能市场详情（README markdown——registry /<pkg> readme 字段） */
export interface SkillMarketDetailItem {
  name: string
  version: string
  description: string
  readme: string
}

export async function getSkillMarketDetail(name: string): Promise<SkillMarketDetailItem | null> {
  try {
    const d = await getPackageDetail(name)
    return {
      name: d.name,
      version: d['dist-tags']?.latest ?? d.version ?? '',
      description: d.description ?? '',
      readme: d.readme ?? '',
    }
  } catch {
    return null
  }
}
