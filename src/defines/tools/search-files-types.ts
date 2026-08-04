/**
 * search-files-types.ts — search-files 工具类型定义（从 tools/desktop/search-files/ 转移）
 */

/** 单条内容搜索匹配（path:line:content 解析结果） */
export interface SearchMatch {
  path: string
  line: number
  content: string
}
