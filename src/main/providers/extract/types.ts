/**
 * providers/extract/types.ts — 网页抓取 provider 接口与数据结构
 */

/** 单条提取结果 */
export interface ExtractResultItem {
  url: string
  title: string
  content: string
  error?: string | null
}

/** 提取 Provider 接口（内置实现 + 插件 provider 的本地形态） */
export interface ExtractProvider {
  readonly id: string
  readonly name: string
  /** 是否支持内容提取（search-only 后端不支持） */
  supportsExtract(): boolean
  isAvailable(): boolean
  extract(urls: string[], format?: string): Promise<ExtractResultItem[]>
}
