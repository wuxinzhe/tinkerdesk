/**
 * constants/llm.ts — LLM 响应类型与错误码常量
 * 对齐 showing-agent LlmConstants（小写风格）。
 */
/** 响应类型 */
export const RES_TEXT = 'text'
export const RES_TOOL_CALLS = 'tool_calls'
export const RES_REASONING = 'reasoning'
export const RES_EMPTY = 'empty'
export const RES_TRUNCATED = 'truncated'

/** 错误码 */
export const ERROR_RATE_LIMITED = 'error_rate_limited'
export const ERROR_AUTH_FAILED = 'error_auth_failed'
export const ERROR_CONTEXT_OVERFLOW = 'error_context_overflow'
export const ERROR_SERVER_ERROR = 'error_server_error'
export const ERROR_NETWORK_ERROR = 'error_network_error'
export const ERROR_INVALID_REQUEST = 'error_invalid_request'
export const ERROR_ALL_MODELS_FAILED = 'error_all_models_failed'
