/**
 * llm/index.ts — LLM 模块统一出口
 */
// 实现类
export { AnthropicClient } from './client/anthropic-client'
export { OpenAIClient } from './client/openai-client'
export { GoogleClient } from './client/google-client'
export { LlmClientManager } from './llm-client-manager'
export { LlmOperationManager } from './llm-operation-manager'
export { LlmRouter } from './llm-router'

// 工具函数
export { apiModeFromString, apiModePathSuffix } from './api-mode'
export { errorResponse, ERROR_ALL_MODELS_FAILED, ERROR_AUTH_FAILED, ERROR_CONTEXT_OVERFLOW, ERROR_INVALID_REQUEST, ERROR_NETWORK_ERROR, ERROR_RATE_LIMITED, ERROR_SERVER_ERROR, isSuccess, reasoningResponse, RES_EMPTY, RES_REASONING, RES_TEXT, RES_TOOL_CALLS, textResponse, toolCallsResponse } from './llm-response'
export { createModelConfig, detectCapability } from './model-config'

// 类型（全部集中在 types.ts）
export type {
  ApiMessage, ApiMessageRole,
  ApiMode, CallFn, ChunkCallback, LlmChunk, LlmClient,
  LlmOperation, LlmResponse, LlmRouterOptions, ModelConfig, OperationContext, OperationDecision, ReasoningCapability, Verdict
} from './types'

// 场景常量（集中在 types.ts）
export { SCENE_CHAT, SCENE_SUMMARY, SCENE_TITLE } from './types'

// 接口别名（ILlmClient / ILlmOperation 语义保留）
export type { LlmClient as ILlmClient, LlmOperation as ILlmOperation } from './types'
