/**
 * model-config.ts — 模型配置构造工具
 *
 * ModelConfig: model name, API key, base URL, context limit, API mode.
 * Type definitions live in types.ts; this file only provides
 * detection/constructor helpers.
 */
import type { ApiMode, ModelConfig, ReasoningCapability } from './types'

/**
 * 根据 baseUrl 和 modelName 自动检测推理能力。
 * - DeepSeek / Kimi / MiMo 要求 thinking pad → thinking_required
 * - Mistral / Groq / Cerebras / SambaNova 不认识的字段会报错 → strict
 * - 其余 → standard
 */
export function detectCapability(baseUrl: string | null | undefined, modelName: string | null | undefined): ReasoningCapability {
  const url = (baseUrl ?? '').toLowerCase()
  const name = (modelName ?? '').toLowerCase()

  if (name.includes('deepseek') || name.includes('kimi') || name.includes('mimo') || url.includes('deepseek')) {
    return 'thinking_required'
  }
  if (url.includes('mistral') || url.includes('groq') || url.includes('cerebras') || url.includes('sambanova')) {
    return 'strict'
  }
  return 'standard'
}

/** 构造 ModelConfig（自动检测推理能力） */
export function createModelConfig(
  modelName: string,
  apiKey: string,
  baseUrl: string,
  contextLimit: number,
  apiMode: ApiMode,
  reasoningCapability?: ReasoningCapability
): ModelConfig {
  return {
    modelName,
    apiKey,
    baseUrl,
    contextLimit,
    apiMode,
    reasoningCapability: reasoningCapability ?? detectCapability(baseUrl, modelName),
  }
}
