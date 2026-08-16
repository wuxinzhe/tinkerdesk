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

const REGISTRY_SEARCH = 'https://registry.npmjs.org/-/v1/search'

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
