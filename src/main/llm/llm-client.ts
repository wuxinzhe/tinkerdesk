/**
 * llm-client.ts — LLM 客户端接口
 *
 * 对应 showing-agent ILlmClient：每种 ApiMode 对应一个实现。
 * - 'openai' → OpenAIClient
 * - 'anthropic' → AnthropicClient
 *
 * 类型定义集中在 types.ts，本文件仅保留语义注释（类型本身从 types.ts 导出）。
 */
export type {LlmClient} from './types'
