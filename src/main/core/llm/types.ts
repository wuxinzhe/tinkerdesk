/**
 * types.ts — LLM 模块统一类型定义
 *
 * 集中存放 llm 包下所有类型（接口/枚举/回调）+ 场景常量，
 * 实现文件只从本文件 import。
 * 对应 tinker-agent core/llm 包的 ApiMessage / ApiMode / ModelConfig /
 * LlmResponse / LlmChunk / OperationDecision / ILlmClient / ILlmOperation。
 */
import type { ToolSchema } from '../tool/tool-schema'

/** 场景常量（对应 tinker-agent ChatOperation / SummaryOperation / TitleOperation） */
export const SCENE_CHAT = 'main_conversation'
export const SCENE_SUMMARY = 'conversation_compression'
export const SCENE_TITLE = 'title_generation'

// ── 工具调用（原 types 的 ToolCall，main 内部契约） ──

/** 工具调用（LLM 发起的工具调用，main 内部使用） */
export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  result?: unknown
  error?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  toolMultiCall?: Record<string, { name: string; arguments?: Record<string, unknown>; status?: string }>
}

// ── ApiMessage（api-message.ts） ──────────────────────────────────

/** 统一 LLM 请求（main 层 client 封装——兼容不同厂商：各 client 自行映射推理深度等参数） */
export interface LlmRequest {
  config: ModelConfig
  messages: ApiMessage[]
  tools: ToolSchema[]
  /** 推理深度（low/medium/high——OpenAI 兼容派直传 reasoning_effort；预算派映射 thinkingBudget） */
  reasoningDepth?: string
}

/** 消息角色（system/user/assistant/tool） */
export type ApiMessageRole = 'system' | 'user' | 'assistant' | 'tool'

/** API 消息（不可变） */
export interface ApiMessage {
  role: ApiMessageRole
  content: string
  /** 推理内容（DeepSeek/Claude thinking） */
  reasoningContent?: string
  /** 工具调用 JSON 字符串 */
  toolCall?: string
  /** 工具调用 ID */
  toolCallId?: string
  /** 工具名称 */
  name?: string
}

// ── ApiMode（api-mode.ts） ────────────────────────────────────────

/** LLM API 协议模式：决定客户端请求体格式与响应解析逻辑 */
export type ApiMode = 'openai' | 'anthropic' | 'google'

// ── ModelConfig（model-config.ts） ────────────────────────────────

/** 推理能力（自动检测）：standard / thinking_required / strict */
export type ReasoningCapability = 'standard' | 'thinking_required' | 'strict'

/** 单次 LLM 调用的模型配置（解析后不可变） */
export interface ModelConfig {
  modelName: string
  apiKey: string
  baseUrl: string
  contextLimit: number
  apiMode: ApiMode
  reasoningCapability: ReasoningCapability
}

// ── LlmResponse（llm-response.ts） ────────────────────────────────

/** LLM 调用结果（所有下游层只根据 resType 做 switch/case 分发） */
export interface LlmResponse {
  /** 响应分类：RES_TEXT / RES_TOOL_CALLS / RES_REASONING / RES_EMPTY / ERROR_* */
  resType: string
  /** 文本内容 */
  text: string
  /** 工具调用列表 */
  toolCalls: ToolCall[]
  /** 推理内容 */
  reasoningContent?: string
  /** 结束原因 */
  finishReason?: string
  /** token 统计 */
  promptTokens?: number
  completionTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  /** 错误消息（仅 ERROR_* 类型有效） */
  errorMessage?: string
  /** 重试等待秒数 */
  retryAfterSeconds?: number
}

// ── LlmChunk + ChunkCallback（streaming-chunk.ts） ────────────────

/** 流式 SSE chunk 的 token 封装（三种内容各自独立，接收方检查非空字段分别路由） */
export interface LlmChunk {
  /** 文本内容增量（delta.content），无文本时为空字符串 */
  text: string
  /** 推理内容增量（delta.reasoning_content），无推理时为空字符串 */
  reasoning: string
  /** 工具调用参数增量（delta.tool_calls[*].function.arguments），无工具调用时为空字符串 */
  toolCallArgs: string
  /** 工具名（工具调用增量首次出现时携带——前端流式拼工具卡片用） */
  toolCallName?: string
  /** 工具调用 index（多工具时区分——前端按 index 分路拼装；缺省 0 单工具兼容） */
  toolCallIndex?: number
  /** 是否为流的最后一个信号 */
  isFinish: boolean
  /** 结束原因：stop / tool_calls / length / content_filter */
  finishReason?: string
}

/** 流式 token 回调类型（每个 SSE chunk 到达时调用一次） */
export type ChunkCallback = (chunk: LlmChunk) => void

// ── OperationDecision（operation-decision.ts） ────────────────────

/** Operation Phase 3 判决结果枚举 */
export type Verdict = 'SUCCESS' | 'FATAL' | 'RETRYABLE'

/** LLM Operation 的 Phase 3 判决结果 */
export interface OperationDecision {
  verdict: Verdict
}

// ── LlmClient（llm-client.ts） ────────────────────────────────────

/** LLM API 客户端接口（每种 ApiMode 一个实现——统一 LlmRequest 入参，各厂商自行映射） */
export interface LlmClient {
  /** API 协议模式 */
  readonly apiMode: ApiMode

  /** 非流式调用 LLM API（SDK 异常内部捕获转换为 error 响应） */
  callNonStreaming(request: LlmRequest): Promise<LlmResponse>

  /** 流式调用 LLM API（每 chunk 通过 tokenCallback 传出） */
  callStreaming(request: LlmRequest, tokenCallback: ChunkCallback): Promise<LlmResponse>
}

// ── LlmOperation（llm-operation.ts） ──────────────────────────────

/** Operation 场景上下文（TS 版简化：只携带构建输入所需数据） */
export interface OperationContext {
  [key: string]: unknown
}

/** LLM Operation 可插拔实现（Phase 1 构建输入 + Phase 3 判决） */
export interface LlmOperation {
  /** 场景标识（如 'main_conversation' / 'title_generation'） */
  readonly scene: string

  /** 场景显示名（如 '主对话'；前端场景列表展示用） */
  readonly name: string

  /** Phase 1: 构建 LLM 请求的输入消息列表 */
  buildInput(ctx: OperationContext, rawMessages: ApiMessage[], tools: ToolSchema[]): ApiMessage[]

  /** Phase 3: 判决 LLM 返回结果，决定循环是否继续 */
  handle(response: LlmResponse, ctx: OperationContext, rawMessages: ApiMessage[], tools: ToolSchema[]): OperationDecision
}

// ── LlmRouter（llm-router.ts） ────────────────────────────────────

/** LLM 调用选项（scene + messages + tools + 数据模型配置） */
export interface LlmRouterOptions {
  /** 场景标识（如 'chat' / 'summary' / 'title_generation'） */
  scene: string
  /** 输入消息列表（Phase 1 前原始消息） */
  messages: ApiMessage[]
  /** 工具 Schema 列表 */
  tools: ToolSchema[]
  /** 模型配置（数据，按场景已解析；替代原 getModelConfigs 函数） */
  modelConfigs: ModelConfig[]
  /** 推理深度（'' = 未设置/默认——各 client 映射 reasoning_effort 或 thinkingBudget） */
  reasoningDepth?: string
}

/** 模型调用函数（非流式或流式实现，由 LlmRouter 内部使用） */
export type CallFn = (config: ModelConfig, input: ApiMessage[]) => Promise<LlmResponse>
