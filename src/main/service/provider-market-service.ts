/**
 * provider-market-service.ts — 扩展市场业务层（service）
 *
 * 职责：市场列表组装（合并去重/前缀过滤/官方标记/installed 状态）——
 * 数据来自 repository（npm-registry-repository）——结果结构定义在本文件——
 * controller 层只做 IPC 转发（DTO 透传）。
 */
import { getPackageDetail, searchNpm, type NpmPackage } from '../repository/npm-registry-repository'

/* ── service 层类型（业务结构——controller/renderer 消费） ── */

/** 市场扩展条目（controller → renderer） */
export interface MarketProviderItem {
  name: string
  version: string
  description: string
  updated: string
  /** 官方维护者标记（前端打"官方"徽章） */
  official: boolean
  /** 已安装（对比本地注册表——前端显示"已安装"） */
  installed: boolean
  /** 分类（package.json keywords——生态标记外的能力分类词） */
  categories: string[]
}

/** 市场查询结果（列表 + 可用分类） */
export interface MarketListResult {
  items: MarketProviderItem[]
  categories: string[]
}

/** 扩展详情（详情页展示——npm 包元数据 + 官方标记 + 已安装） */
export interface MarketProviderDetail {
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
export interface MarketQueryParams {
  /** 本地已安装扩展 id 列表（对比标记） */
  installedIds: string[]
  /** 分类筛选（npm search keywords:<分类>——真实 registry 查询） */
  category?: string
  /** 搜索词（npm search text——名称/描述匹配） */
  search?: string
}

/* ── 常量 ── */

/** 官方维护者账户（打"官方"徽章）——配置化（后续可改 app_settings） */
export const OFFICIAL_MAINTAINER = 'wuxinzhe'

/** 市场生态前缀（只显示此前缀的包） */
export const MARKET_PREFIX = 'tinkerdesk-provider-'

/* ── 业务实现 ── */

/** 生态开放查询（keywords:tinkerdesk-provider + 可选分类/搜索词——真实 registry 查询） */
async function queryEcosystem(category?: string, search?: string): Promise<NpmPackage[]> {
  // npm search 语法：空格 = AND——组合条件精确查询
  const parts = ['keywords:tinkerdesk-provider']
  if (category) parts.push(`keywords:${category}`)
  if (search && search.trim()) parts.push(search.trim())
  const res = await searchNpm({ text: parts.join(' ') })
  return (res.objects ?? []).map((o) => o.package)
}

/** 官方账户补充查询（索引延迟兜底——官方扩展必现——带同样筛选条件） */
async function queryOfficial(category?: string, search?: string): Promise<NpmPackage[]> {
  const parts = [`maintainer:${OFFICIAL_MAINTAINER}`]
  if (category) parts.push(`keywords:${category}`)
  if (search && search.trim()) parts.push(search.trim())
  const res = await searchNpm({ text: parts.join(' ') })
  return (res.objects ?? []).map((o) => o.package)
}

/** 市场分类词（生态标记 tinkerdesk-provider 之外的能力分类——约定词表） */
export const MARKET_CATEGORIES = ['voice', 'tts', 'stt', 'vision', 'tool', 'model', 'video', 'image', 'agent']

/** 扩展市场列表（生态开放 + 官方标记 + installed 状态 + 分类——真实 npm 搜索） */
export async function listMarketProviders(params: MarketQueryParams): Promise<MarketListResult> {
  const [eco, official] = await Promise.all([
    queryEcosystem(params.category, params.search),
    queryOfficial(params.category, params.search),
  ])
  // 合并去重（keywords 命中优先保留）
  const map = new Map<string, NpmPackage>()
  for (const p of [...eco, ...official]) {
    if (!map.has(p.name)) map.set(p.name, p)
  }
  const list = Array.from(map.values())
    // 市场生态限定前缀（dsh-* 等不混入）
    .filter((p) => p.name.startsWith(MARKET_PREFIX))
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
    installed: params.installedIds.includes(p.name.slice(MARKET_PREFIX.length)),
    categories: (p.keywords ?? []).filter((k) => MARKET_CATEGORIES.includes(k)),
    keywords: (p.keywords ?? []).filter((k) => k !== MARKET_PREFIX),
  }))
  // 分类聚合（所有扩展出现过的分类——去重——排序）
  const categories = Array.from(new Set(items.flatMap((i) => i.categories))).sort()
  return { items, categories }
}

/** 扩展详情（npm 包元数据 + 官方标记 + 已安装状态——非市场前缀包按未安装处理） */
export async function getMarketProviderDetail(name: string, installedIds: string[]): Promise<MarketProviderDetail> {
  const d = await getPackageDetail(name)
  const inEcosystem = d.name.startsWith(MARKET_PREFIX)
  // 版本号：顶层 version 缺失时用 dist-tags.latest 兜底
  const version = d.version ?? d['dist-tags']?.latest ?? ''
  return {
    name: d.name,
    version,
    description: d.description ?? '',
    readme: d.readme ?? '',
    homepage: d.homepage ?? '',
    categories: (d.keywords ?? []).filter((k) => MARKET_CATEGORIES.includes(k)),
    official: (d.maintainers ?? []).some((m) => m.username === OFFICIAL_MAINTAINER),
    installed: inEcosystem ? installedIds.includes(d.name.slice(MARKET_PREFIX.length)) : false,
    updated: d.time?.[d.version] ?? d.time?.modified ?? '',
    dependencies: Object.keys(d.dependencies ?? {}),
  }
}
