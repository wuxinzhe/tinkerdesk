/**
 * plugin-market.ts — 插件市场（npm registry search——生态开放）
 *
 * 数据源：npm 官方 registry search API（免费公开——无需 key）
 *   keywords:tinkerdesk-plugin —— 生态开放（任何打了关键词的插件）
 *   maintainer:<官方账户>       —— 官方插件（补充——索引延迟兜底）
 * 官方标记：maintainers 含官方账户 → official: true（前端打"官方"徽章）
 *
 * 注：npm search 索引异步——发布后列表更新有延迟（分钟级）——
 *     点击安装时 installNpm 装 latest（实时——不受索引延迟影响）。
 */
import { get } from 'https'

export interface MarketPlugin {
  name: string
  version: string
  description: string
  updated: string
  official: boolean
  /** 已安装（对比本地注册表——前端展示） */
  installed?: boolean
}

const REGISTRY_SEARCH = 'https://registry.npmjs.org/-/v1/search'

function search(text: string, size = 50): Promise<MarketPlugin[]> {
  return new Promise((resolve, reject) => {
    const url = `${REGISTRY_SEARCH}?text=${encodeURIComponent(text)}&size=${size}`
    get(url, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => {
        try {
          const d = JSON.parse(body) as {
            objects?: { package: { name: string; version: string; description?: string; date?: string; maintainers?: { username?: string }[] } }[]
          }
          resolve(
            (d.objects ?? []).map((o) => ({
              name: o.package.name,
              version: o.package.version,
              description: o.package.description ?? '',
              updated: o.package.date ?? '',
              official: (o.package.maintainers ?? []).some((m) => m.username === OFFICIAL_MAINTAINER),
            })),
          )
        } catch (e) {
          reject(new Error(`npm search 响应解析失败: ${(e as Error).message}`))
        }
      })
    }).on('error', (e) => reject(new Error(`npm search 请求失败: ${e.message}`)))
  })
}

/** 官方维护者账户（打"官方"徽章）——配置文件可覆盖 */
export const OFFICIAL_MAINTAINER = 'wuxinzhe'

/** 插件市场列表（生态开放：keywords 搜索 + 官方 maintainer 补充——合并去重） */
export async function listMarketPlugins(installedIds: string[] = []): Promise<MarketPlugin[]> {
  const [eco, official] = await Promise.all([
    search('keywords:tinkerdesk-plugin'),
    search(`maintainer:${OFFICIAL_MAINTAINER}`),
  ])
  // 合并去重（keywords 命中优先保留）
  const map = new Map<string, MarketPlugin>()
  for (const p of [...eco, ...official]) {
    if (!map.has(p.name)) map.set(p.name, p)
  }
  const list = Array.from(map.values())
    // 只显示 tinkerdesk-plugin 前缀（生态市场限定——dsh-* 等不混入）
    .filter((p) => p.name.startsWith('tinkerdesk-plugin-'))
    .sort((a, b) => (a.official === b.official ? b.updated.localeCompare(a.updated) : a.official ? -1 : 1))
  for (const p of list) {
    p.installed = installedIds.includes(p.name.split('tinkerdesk-plugin-')[1])
  }
  return list
}
