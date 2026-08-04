/**
 * web-search-types.ts — web-search 工具类型定义（从 tools/desktop/web-search/ 转移）
 */

/** 单条搜索结果 */
export interface WebSearchResultItem {
  title: string
  url: string
  description: string
  position: number
}

/** 搜索响应（对齐 Hermes：provider.search 直接返回完整 response_data） */
export interface WebSearchResponseData {
  success: boolean
  data?: { web: WebSearchResultItem[] }
  error?: string
}

/** 搜索后端抽象（对齐 Hermes WebSearchProvider） */
export interface SearchProvider {
  readonly id: string
  readonly name: string
  supportsSearch(): boolean
  /** 配置是否满足（key/URL），供 availability-walk 过滤 */
  isAvailable(): boolean
  /** 返回完整 response_data，不抛异常（失败返回 {success:false,error}） */
  search(query: string, limit: number): Promise<WebSearchResponseData>
}
