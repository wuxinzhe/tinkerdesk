/**
 * npm-registry-repository.ts — npm registry 数据访问层（repository）
 *
 * 职责：只做"数据获取"（npm search API 查询——原始响应解析）——
 * 不含业务逻辑（合并/过滤/标记——归 service 层）。
 * 数据结构（npm 原始响应）定义在本文件——service 层不感知 HTTP。
 */
import { get } from 'https'

/* ── repository 层类型（npm registry 原始响应结构） ── */

/** npm search 响应（原始——未过滤） */
export interface NpmSearchResponse {
  objects: NpmSearchObject[]
  total: number
}

export interface NpmSearchObject {
  package: NpmPackage
}

/** npm 包元数据（search 返回子集） */
export interface NpmPackage {
  name: string
  version: string
  description?: string
  date?: string
  maintainers?: { username?: string }[]
  keywords?: string[]
}

/** repository 查询参数 */
export interface NpmSearchParams {
  /** search text（支持 keywords:/maintainer: 前缀） */
  text: string
  size?: number
}

/** npm 包详情（registry API /<pkg>——详情页展示） */
export interface NpmPackageDetail {
  name: string
  version: string
  description?: string
  readme?: string
  homepage?: string
  repository?: { url?: string }
  keywords?: string[]
  maintainers?: { username?: string }[]
  time?: Record<string, string>
  dependencies?: Record<string, string>
}

const REGISTRY_BASE = 'https://registry.npmjs.org'
const REGISTRY_SEARCH = `${REGISTRY_BASE}/-/v1/search`

function httpsGetJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (e) {
          reject(new Error(`npm registry 响应解析失败: ${(e as Error).message}`))
        }
      })
    }).on('error', (e) => reject(new Error(`npm registry 请求失败: ${e.message}`)))
  })
}

/** 查询 npm 包详情（registry API /<pkg>——含 readme/依赖/时间线） */
export async function getPackageDetail(name: string): Promise<NpmPackageDetail> {
  const d = (await httpsGetJson(`${REGISTRY_BASE}/${encodeURIComponent(name)}`)) as NpmPackageDetail
  return d
}

/** 查询 npm 包 tarball 下载地址（registry API dist.tarball——可带进度下载） */
export async function getPackageTarball(name: string): Promise<{ url: string; size?: number }> {
  const d = (await httpsGetJson(`${REGISTRY_BASE}/${encodeURIComponent(name)}`)) as {
    'dist-tags'?: Record<string, string>
    versions?: Record<string, { dist?: { tarball?: string; unpackedSize?: number; fileCount?: number } }>
  }
  const latest = d['dist-tags']?.latest ?? ''
  const v = latest ? d.versions?.[latest] : undefined
  const dist = v && typeof v === 'object' && 'dist' in v ? v.dist : undefined
  const tarball = dist?.tarball
  if (!tarball) throw new Error(`npm 包 ${name} 无 tarball 地址`)
  return { url: tarball, size: dist?.unpackedSize }
}

/** 查询 npm registry search API（原始响应——解析失败抛错） */
export function searchNpm(params: NpmSearchParams): Promise<NpmSearchResponse> {
  const { text, size = 50 } = params
  return new Promise((resolve, reject) => {
    const url = `${REGISTRY_SEARCH}?text=${encodeURIComponent(text)}&size=${size}`
    get(url, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(body) as NpmSearchResponse)
        } catch (e) {
          reject(new Error(`npm search 响应解析失败: ${(e as Error).message}`))
        }
      })
    }).on('error', (e) => reject(new Error(`npm search 请求失败: ${e.message}`)))
  })
}
