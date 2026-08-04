/**
 * llm/index.ts — LLM 模块统一出口
 */
// 实现类
export {LlmClientManager} from './llm-client-manager'
export {LlmOperationManager} from './llm-operation-manager'
export {LlmRouter} from './llm-router'
export {OpenAIClient} from './client/openai-client'
export {AnthropicClient} from './client/anthropic-client'

// 工具函数
export {apiModeFromString, apiModePathSuffix} from './api-mode'
export {createModelConfig, detectCapability} from './model-config'
export {
  systemMessage, userMessage, assistantMessage, toolMessage, buildMessage,
} from './api-message'
export {
  textResponse, toolCallsResponse, reasoningResponse, emptyResponse, errorResponse,
  isSuccess, hasToolCalls, isText,
  RES_TEXT, RES_TOOL_CALLS, RES_REASONING, RES_EMPTY,
  ERROR_RATE_LIMITED, ERROR_AUTH_FAILED, ERROR_CONTEXT_OVERFLOW,
  ERROR_SERVER_ERROR, ERROR_NETWORK_ERROR, ERROR_INVALID_REQUEST, ERROR_ALL_MODELS_FAILED,
} from './llm-response'
export {emptyChunk, textChunk, reasoningChunk, toolArgsChunk, finishChunk} from './streaming-chunk'
export {operationSuccess, operationFatal, operationRetryable} from './operation-decision'

// 类型（全部集中在 types.ts）
export type {
  ApiMessage, ApiMessageRole,
  ApiMode,
  ModelConfig, ReasoningCapability,
  LlmResponse,
  StreamingChunk, TokenCallback,
  OperationDecision, Verdict,
  LlmClient,
  LlmOperation, OperationContext,
  LlmRouterContext,
  CallFn,
} from './types'

// 接口 re-export（保持 ./llm-client / ./llm-operation 路径语义）
export type {LlmClient as ILlmClient} from './types'
export type {LlmOperation as ILlmOperation} from './types'
