import type { LlmResponse } from './types'

/**
 * llm-response.ts — LLM 响应常量与工厂
 *
 * 对应 tinker-agent LlmResponse：所有下游层只根据 resType 做分发。
 * 类型定义集中在 types.ts，本文件只提供常量、工厂和查询方法。
 */

// ── 响应类型常量 ──

export const RES_TEXT = 'RES_TEXT'
export const RES_TOOL_CALLS = 'RES_TOOL_CALLS'
export const RES_REASONING = 'RES_REASONING'
export const RES_EMPTY = 'RES_EMPTY'
export const RES_TRUNCATED = 'RES_TRUNCATED'

export const ERROR_RATE_LIMITED = 'ERROR_RATE_LIMITED'
export const ERROR_AUTH_FAILED = 'ERROR_AUTH_FAILED'
export const ERROR_CONTEXT_OVERFLOW = 'ERROR_CONTEXT_OVERFLOW'
export const ERROR_SERVER_ERROR = 'ERROR_SERVER_ERROR'
export const ERROR_NETWORK_ERROR = 'ERROR_NETWORK_ERROR'
export const ERROR_INVALID_REQUEST = 'ERROR_INVALID_REQUEST'
export const ERROR_ALL_MODELS_FAILED = 'ERROR_ALL_MODELS_FAILED'

/** 错误类型集合（用于 isSuccess 判定） */
const ERROR_TYPES = new Set([
  ERROR_RATE_LIMITED,
  ERROR_AUTH_FAILED,
  ERROR_CONTEXT_OVERFLOW,
  ERROR_SERVER_ERROR,
  ERROR_NETWORK_ERROR,
  ERROR_INVALID_REQUEST,
  ERROR_ALL_MODELS_FAILED,
])

// ── 工厂方法 ──

/** 文本成功响应 */
export function textResponse(text: string, extra?: Partial<Omit<LlmResponse, 'resType' | 'text'>>): LlmResponse {
  return { resType: RES_TEXT, text, toolCalls: [], ...extra }
}

/** 工具调用响应 */
export function toolCallsResponse(toolCalls: LlmResponse['toolCalls'], extra?: Partial<Omit<LlmResponse, 'resType' | 'toolCalls'>>): LlmResponse {
  return { resType: RES_TOOL_CALLS, text: '', toolCalls, ...extra }
}

/** reasoning-only 响应（thinking prefilling） */
export function reasoningResponse(reasoningContent: string): LlmResponse {
  return { resType: RES_REASONING, text: '', toolCalls: [], reasoningContent }
}

/** 错误响应 */
export function errorResponse(type: string, message: string, retryAfterSeconds = 0): LlmResponse {
  return { resType: type, text: '', toolCalls: [], errorMessage: message, retryAfterSeconds }
}

// ── 查询方法 ──

/** 成功判定：resType 不是已知错误类型 */
export function isSuccess(response: LlmResponse): boolean {
  return !ERROR_TYPES.has(response.resType)
}
