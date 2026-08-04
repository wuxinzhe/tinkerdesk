/**
 * model-config.ts — 模型配置构造工具
 *
 * 对应 showing-agent ModelConfig：模型名称、API 密钥、基础 URL、上下文限制、API 模式。
 * 类型定义集中在 types.ts，本文件只提供检测/构造函数。
 */
import type {ApiMode, ModelConfig, ReasoningCapability} from './types'

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
