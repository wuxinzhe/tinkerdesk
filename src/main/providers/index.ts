/**
 * providers/index.ts — 内置 provider 包统一导出
 *
 * 与 core/plugin（插件 provider 注册表机制）对称：
 * 插件 provider 在运行时注册；内置 provider 在此编译期声明。
 */
export * as searchProviders from './search'
export * as extractProviders from './extract'
export type { SearchProvider, SearchResultItem, WebSearchResponseData } from './search/types'
export type { ExtractProvider, ExtractResultItem } from './extract/types'
