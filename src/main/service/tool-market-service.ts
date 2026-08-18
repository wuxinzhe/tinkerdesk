/**
 * tool-market-service.ts — 工具市场业务层（service）
 *
 * 职责：工具市场列表组装（合并去重/前缀过滤/官方标记/installed 状态）——
 * 数据来自 repository（npm-registry-repository）——结果结构定义在本文件——
 * controller 层只做 IPC 转发（DTO 透传）。
 * 安装接口在 ToolCenter（工具中心负责生命周期）——本 service 只做市场查询。
 */
import { getPackageDetail, searchNpm, type NpmPackage } from '../repository/npm-registry-repository'
import { OFFICIAL_MAINTAINER } from './provider-market-service'

/* ── service 层类型（controller → renderer） ── */

/** 市场工具条目（controller → renderer） */
export interface MarketToolItem {
  name: string
  version: string
  description: string
  updated: string
  /** 官方维护者标记（前端打"官方"徽章） */
  official: boolean
  /** 已安装（对比本地工具中心已装清单——前端显示"已安装"） */
  installed: boolean
  /** 分类（package.json keywords——能力分类词） */
  categories: string[]
  /** 附加 keywords（生态标记外——前端卡面标签） */
  keywords: string[]
}

/** 市场查询结果（列表 + 可用分类） */
export interface MarketToolListResult {
  items: MarketToolItem[]
  categories: string[]
}

/** 工具详情（详情页展示——npm 包元数据 + 官方标记 + 已安装） */
export interface MarketToolDetail {
  name: string
  version: string
  description: string
  readme: string
  homepage: string
  categories: string[]
  official: boolean
  installed: boolean
  updated: string
  dependencies: string[]
}

/** 市场查询参数 */
export interface MarketToolQueryParams {
  /** 本地已安装工具 id 列表（对比标记） */
  installedIds: string[]
  /** 搜索词（真实 registry 查询） */
  search?: string
}

/* ── 常量 ── */

/** 工具生态前缀（tinkerdesk-tools monorepo——packages/* → tinkerdesk-tool-*） */
export const TOOL_MARKET_PREFIX = 'tinkerdesk-tool-'

/** 工具分类词（生态标记之外的能力分类——约定词表） */
export const TOOL_MARKET_CATEGORIES = ['computer', 'voice', 'tts', 'stt', 'media', 'image', 'video', 'desktop', 'automation', 'plugin']

/* ── 业务实现 ── */

/** 生态开放查询（keywords:tinkerdesk-tool + 可选搜索词——真实 registry 查询） */
async function queryEcosystem(search?: string): Promise<NpmPackage[]> {
  const parts = ['keywords:tinkerdesk-tool']
  if (search && search.trim()) parts.push(search.trim())
  const res = await searchNpm({ text: parts.join(' ') })
  return (res.objects ?? []).map((o) => o.package)
}

/** 官方账户补充查询（索引延迟兜底——官方包必现——带同样搜索条件） */
async function queryOfficial(search?: string): Promise<NpmPackage[]> {
  const parts = [`maintainer:${OFFICIAL_MAINTAINER}`]
  if (search && search.trim()) parts.push(search.trim())
  const res = await searchNpm({ text: parts.join(' ') })
  return (res.objects ?? []).map((o) => o.package)
}

/** 工具市场列表（生态开放 + 官方标记 + installed 状态——真实 npm 搜索） */
export async function listMarketTools(params: MarketToolQueryParams): Promise<MarketToolListResult> {
  const [eco, official] = await Promise.all([
    queryEcosystem(params.search),
    queryOfficial(params.search),
  ])
  // 合并去重（keywords 命中优先保留）
  const map = new Map<string, NpmPackage>()
  for (const p of [...eco, ...official]) {
    if (!map.has(p.name)) map.set(p.name, p)
  }
  const list = Array.from(map.values())
    // 市场生态限定前缀（不混入无关包）
    .filter((p) => p.name.startsWith(TOOL_MARKET_PREFIX))
    .sort((a, b) => {
      const aOfficial = (a.maintainers ?? []).some((m) => m.username === OFFICIAL_MAINTAINER)
      const bOfficial = (b.maintainers ?? []).some((m) => m.username === OFFICIAL_MAINTAINER)
      if (aOfficial !== bOfficial) return aOfficial ? -1 : 1
      return (b.date ?? '').localeCompare(a.date ?? '')
    })
  const items = list.map((p) => ({
    name: p.name,
    version: p.version,
    description: p.description ?? '',
    updated: p.date ?? '',
    official: (p.maintainers ?? []).some((m) => m.username === OFFICIAL_MAINTAINER),
    installed: params.installedIds.includes(p.name.slice(TOOL_MARKET_PREFIX.length)),
    categories: (p.keywords ?? []).filter((k) => TOOL_MARKET_CATEGORIES.includes(k)),
    keywords: (p.keywords ?? []).filter((k) => !k.startsWith('tinkerdesk-tool') && !TOOL_MARKET_CATEGORIES.includes(k)),
  }))
  const categories = Array.from(new Set(items.flatMap((i) => i.categories))).sort()
  return { items, categories }
}

/** 工具详情（npm 包元数据 + 官方标记 + 已安装状态——非市场前缀包按未安装处理） */
export async function getMarketToolDetail(name: string, installedIds: string[]): Promise<MarketToolDetail> {
  const d = await getPackageDetail(name)
  const inEcosystem = d.name.startsWith(TOOL_MARKET_PREFIX)
  // 版本号：顶层 version 缺失时用 dist-tags.latest 兜底
  const version = d.version ?? d['dist-tags']?.latest ?? ''
  return {
    name: d.name,
    version,
    description: d.description ?? '',
    readme: d.readme ?? '',
    homepage: d.homepage ?? '',
    categories: (d.keywords ?? []).filter((k) => TOOL_MARKET_CATEGORIES.includes(k)),
    official: (d.maintainers ?? []).some((m) => m.username === OFFICIAL_MAINTAINER),
    installed: inEcosystem ? installedIds.includes(d.name.slice(TOOL_MARKET_PREFIX.length)) : false,
    updated: d.time?.[d.version] ?? d.time?.modified ?? '',
    dependencies: Object.keys(d.dependencies ?? {}),
  }
}