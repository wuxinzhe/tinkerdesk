/**
 * api-mode.ts — API 模式工具函数
 *
 * 对应 showing-agent ApiMode：决定客户端使用哪套请求体格式和响应解析逻辑。
 * 类型定义集中在 types.ts，本文件只提供转换/路径工具。
 */
import type {ApiMode} from './types'

/** 从字符串（providers.api_mode 字段）映射到 ApiMode */
export function apiModeFromString(mode: string | null | undefined): ApiMode {
  if (!mode) {
    return 'openai'
  }
  const m = mode.toLowerCase().trim()
  if (m === 'anthropic') {
    return 'anthropic'
  }
  if (m === 'openai') {
    return 'openai'
  }
  throw new Error(`不支持的 API 模式: '${mode}'。支持: openai, anthropic`)
}

/** 该模式请求 API 的路径后缀（拼在 baseUrl 后面） */
export function apiModePathSuffix(mode: ApiMode): string {
  return mode === 'anthropic' ? '/v1/messages' : '/chat/completions'
}
