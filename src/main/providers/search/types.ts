/**
 * providers/search/types.ts — 网页搜索 provider 接口与数据结构
 */

/** 搜索结果条目 */
export interface SearchResultItem {
  title: string
  url: string
  description: string
  position: number
}

/** 搜索响应数据 */
export interface WebSearchResponseData {
  success: boolean
  error?: string
  data?: {
    web: SearchResultItem[]
  }
}

/** 搜索 Provider 接口（内置实现 + 插件 provider 的本地形态） */
export interface SearchProvider {
  readonly id: string
  readonly name: string
  supportsSearch(): boolean
  isAvailable(): boolean
  search(query: string, limit: number): Promise<WebSearchResponseData>
}
