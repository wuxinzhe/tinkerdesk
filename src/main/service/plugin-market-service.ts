/**
 * plugin-market-service.ts — 插件市场业务层（service）
 *
 * 职责：市场列表组装（合并去重/前缀过滤/官方标记/installed 状态）——
 * 数据来自 repository（npm-registry-repository）——结果结构定义在本文件——
 * controller 层只做 IPC 转发（DTO 透传）。
 */
import { searchNpm, type NpmPackage } from '../repository/npm-registry-repository'

/* ── service 层类型（业务结构——controller/renderer 消费） ── */

/** 市场插件条目（controller → renderer） */
export interface MarketPluginItem {
  name: string
  version: string
  description: string
  updated: string
  /** 官方维护者标记（前端打"官方"徽章） */
  official: boolean
  /** 已安装（对比本地注册表——前端显示"已安装"） */
  installed: boolean
}

/** 市场查询参数 */
export interface MarketQueryParams {
  /** 本地已安装插件 id 列表（对比标记） */
  installedIds: string[]
}

/* ── 常量 ── */

/** 官方维护者账户（打"官方"徽章）——配置化（后续可改 app_settings） */
export const OFFICIAL_MAINTAINER = 'wuxinzhe'

/** 市场生态前缀（只显示此前缀的包） */
export const MARKET_PREFIX = 'tinkerdesk-plugin-'

/* ── 业务实现 ── */

/** 生态开放查询（打了 keywords:tinkerdesk-plugin 的包） */
async function queryEcosystem(): Promise<NpmPackage[]> {
  const res = await searchNpm({ text: 'keywords:tinkerdesk-plugin' })
  return (res.objects ?? []).map((o) => o.package)
}

/** 官方账户补充查询（索引延迟兜底——官方插件必现） */
async function queryOfficial(): Promise<NpmPackage[]> {
  const res = await searchNpm({ text: `maintainer:${OFFICIAL_MAINTAINER}` })
  return (res.objects ?? []).map((o) => o.package)
}

/** 插件市场列表（生态开放 + 官方标记 + installed 状态） */
export async function listMarketPlugins(params: MarketQueryParams): Promise<MarketPluginItem[]> {
  const [eco, official] = await Promise.all([queryEcosystem(), queryOfficial()])
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
    .map((p) => ({
      name: p.name,
      version: p.version,
      description: p.description ?? '',
      updated: p.date ?? '',
      official: (p.maintainers ?? []).some((m) => m.username === OFFICIAL_MAINTAINER),
      installed: params.installedIds.includes(p.name.slice(MARKET_PREFIX.length)),
    }))
  return list
}
