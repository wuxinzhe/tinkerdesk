/**
 * llm-chunk.ts — 流式 chunk 工厂函数
 *
 * 对应 showing-agent StreamingChunk（LlmChunk）：三种内容类型各自独立字段，
 * 接收方检查非空字段分别路由，不做组合假设。
 * 类型定义集中在 types.ts（LlmChunk），本文件只提供构造工厂。
 */
import type {LlmChunk} from './types'

/** 构造一个空 chunk */
export function emptyChunk(): LlmChunk {
  return {text: '', reasoning: '', toolCallArgs: '', isFinish: false}
}

/** 文本增量 chunk */
export function textChunk(text: string): LlmChunk {
  return {...emptyChunk(), text}
}

/** 推理增量 chunk */
export function reasoningChunk(reasoning: string): LlmChunk {
  return {...emptyChunk(), reasoning}
}

/** 工具参数增量 chunk */
export function toolArgsChunk(toolCallArgs: string): LlmChunk {
  return {...emptyChunk(), toolCallArgs}
}

/** 流结束信号 */
export function finishChunk(finishReason?: string): LlmChunk {
  return {...emptyChunk(), isFinish: true, finishReason}
}
