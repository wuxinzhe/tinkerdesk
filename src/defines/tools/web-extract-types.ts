/**
 * web-extract-types.ts — web-extract 工具类型定义（从 tools/desktop/web-extract/ 转移）
 */

/** 单条提取结果 */
export interface ExtractResultItem {
  url: string
  title: string
  content: string
  error?: string | null
}

/** 提取后端抽象 */
export interface ExtractProvider {
  readonly id: string
  readonly name: string
  /** 是否支持内容提取（search-only 后端不支持） */
  supportsExtract(): boolean
  isAvailable(): boolean
  extract(urls: string[], format?: string): Promise<ExtractResultItem[]>
}

/** execute() 调试日志数据结构（严格类型，替代 Record<string, unknown>） */
export interface DebugCallData {
  parameters: { urls: string[] | string; format?: string; char_limit?: number }
  error: string | null
  pages_extracted: number
  pages_truncated: number
  original_response_size: number
  final_response_size: number
  truncation_metrics: { url: string; original_size: number; sent_size: number }[]
  processing_applied: string[]
}
