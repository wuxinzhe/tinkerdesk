import OpenAI from 'openai'
import { safeParseJson } from '../../../utils/json-utils'
import type { ToolSchema } from '../../../core/tool/tool-schema'
import {
  ERROR_AUTH_FAILED,
  ERROR_CONTEXT_OVERFLOW,
  ERROR_NETWORK_ERROR,
  ERROR_RATE_LIMITED,
  ERROR_SERVER_ERROR,
  errorResponse,
  reasoningResponse,
  textResponse,
  toolCallsResponse
} from '../llm-response'
import type { ApiMessage, ChunkCallback, LlmClient, LlmResponse, ModelConfig, ToolCall } from '../types'

/**
 * openai-client.ts — OpenAI 兼容客户端
 *
 * 对应 tinker-agent OpenAiLlmClient：apiMode='openai'。
 * SDK 异常统一捕获并转换为 LlmResponse error 格式。
 */
export class OpenAIClient implements LlmClient {
  readonly apiMode = 'openai' as const

  /** 消息 → OpenAI messages */
  private toOpenAIMessages(messages: ApiMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.map((m) => {
      const base = { role: m.role, content: m.content } as OpenAI.Chat.Completions.ChatCompletionMessageParam
      if (m.role === 'tool') {
        return { ...base, tool_call_id: m.toolCallId ?? '' } as OpenAI.Chat.Completions.ChatCompletionMessageParam
      }
      return base
    })
  }

  /** 工具 schema → OpenAI tools */
  private toOpenAITools(tools: ToolSchema[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools as OpenAI.Chat.Completions.ChatCompletionTool[]
  }

  /** SDK 异常 → LlmResponse error */
  private toErrorResponse(e: unknown): LlmResponse {
    const err = e as { status?: number; message?: string; headers?: Record<string, string> }
    const message = err.message ?? '未知错误'
    const retryAfter = err.headers?.['retry-after'] ? parseInt(err.headers['retry-after'], 10) : 0

    switch (err.status) {
      case 401:
      case 403:
        return errorResponse(ERROR_AUTH_FAILED, `认证失败: ${message}`)
      case 429:
        return errorResponse(ERROR_RATE_LIMITED, `请求被限流: ${message}`, retryAfter)
      case 400:
        return errorResponse(ERROR_CONTEXT_OVERFLOW, `请求无效或上下文超限: ${message}`)
      case 500:
      case 502:
      case 503:
        return errorResponse(ERROR_SERVER_ERROR, `服务端错误: ${message}`)
      default:
        return errorResponse(ERROR_NETWORK_ERROR, `网络错误: ${message}`)
    }
  }

  /** 非流式调用 */
  async callNonStreaming(config: ModelConfig, messages: ApiMessage[], tools: ToolSchema[]): Promise<LlmResponse> {
    const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl, timeout: 60000 })
    try {
      const completion = await client.chat.completions.create({
        model: config.modelName,
        messages: this.toOpenAIMessages(messages),
        tools: tools.length > 0 ? this.toOpenAITools(tools) : undefined,
      })

      const message = completion.choices[0]?.message
      const finish = completion.choices[0]?.finish_reason

      if (message?.tool_calls && message.tool_calls.length > 0) {
        const toolCalls: ToolCall[] = message.tool_calls
          .filter((tc) => 'function' in tc && tc.function)
          .map((tc) => {
            const fn = (tc as { function?: { name: string; arguments?: string } }).function
            return {
              id: tc.id,
              name: fn?.name ?? '',
              arguments: JSON.parse(fn?.arguments ?? '{}') as Record<string, unknown>,
              status: 'completed' as const,
            }
          })
        return toolCallsResponse(toolCalls, { finishReason: finish ?? 'stop' })
      }

      const text = message?.content ?? ''
      if (text) {
        return textResponse(text, {
          finishReason: finish ?? 'stop',
          promptTokens: completion.usage?.prompt_tokens,
          completionTokens: completion.usage?.completion_tokens,
        })
      }

      // 无文本 → 检查 reasoning
      const reasoning = (message as unknown as Record<string, unknown>).reasoning_content
      if (typeof reasoning === 'string' && reasoning) {
        return reasoningResponse(reasoning)
      }
      return textResponse('', { finishReason: finish ?? 'stop' })
    } catch (e) {
      return this.toErrorResponse(e)
    }
  }

  /** 流式调用：转发 token 的同时缓存拼装完整 LlmResponse（含工具调用，对齐 Java OpenAiLlmClient） */
  async callStreaming(config: ModelConfig, messages: ApiMessage[], tools: ToolSchema[], onToken: ChunkCallback): Promise<LlmResponse> {
    const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl, timeout: 60000 })
    try {
      const stream = await client.chat.completions.create({
        model: config.modelName,
        messages: this.toOpenAIMessages(messages),
        tools: tools.length > 0 ? this.toOpenAITools(tools) : undefined,
        stream: true,
      })

      let text = ''
      let reasoning = ''
      let finishReason: string | undefined
      let promptTokens: number | undefined
      let completionTokens: number | undefined
      // 工具调用累积：index → {id, name, arguments}（delta 按 index 分片，arguments 增量拼接）
      const toolAccum = new Map<number, { id: string; name: string; arguments: string }>()

      for await (const chunk of stream) {
        const choice = chunk.choices[0]
        if (!choice) {
          // usage 在最后 chunk 携带
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens ?? undefined
            completionTokens = chunk.usage.completion_tokens ?? undefined
          }
          continue
        }
        const delta = choice.delta as Record<string, unknown>

        // 文本增量：转发 + 累积
        if (typeof delta.content === 'string' && delta.content) {
          text += delta.content
          onToken({ text: delta.content, reasoning: '', toolCallArgs: '', isFinish: false })
        }
        // 推理增量（DeepSeek reasoning_content）：转发 + 累积（跳过 "null" 字符串，对齐 Java）
        if (typeof delta.reasoning_content === 'string' && delta.reasoning_content && delta.reasoning_content.trim() !== 'null') {
          reasoning += delta.reasoning_content
          onToken({ text: '', reasoning: delta.reasoning_content, toolCallArgs: '', isFinish: false })
        }
        // 工具调用增量：转发 + 按 index 累积
        const toolCallsDelta = delta.tool_calls as Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> | undefined
        if (toolCallsDelta) {
          for (const tc of toolCallsDelta) {
            const idx = tc.index ?? 0
            const acc = toolAccum.get(idx) ?? { id: '', name: '', arguments: '' }
            if (tc.id) acc.id = tc.id
            if (tc.function?.name) acc.name = tc.function.name
            if (tc.function?.arguments) acc.arguments += tc.function.arguments
            toolAccum.set(idx, acc)
            if (tc.function?.arguments) {
              onToken({ text: '', reasoning: '', toolCallArgs: tc.function.arguments, isFinish: false })
            }
          }
        }
        if (choice.finish_reason) {
          finishReason = choice.finish_reason
        }
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens ?? undefined
          completionTokens = chunk.usage.completion_tokens ?? undefined
        }
      }

      onToken({ text: '', reasoning: '', toolCallArgs: '', isFinish: true, finishReason })

      // ── 组装完整 LlmResponse（对齐 Java：tool_calls → text → reasoning → empty）──
      const toolCalls: ToolCall[] = [...toolAccum.entries()]
        .sort(([a], [b]) => a - b)
        .filter(([, acc]) => acc.name !== '')
        .map(([, acc]) => ({
          id: acc.id || `call_${acc.name}`,
          name: acc.name,
          arguments: safeParseJson(acc.arguments),
          status: 'completed' as const,
        }))

      const extra = { finishReason, promptTokens, completionTokens } as Partial<Omit<LlmResponse, 'resType' | 'text' | 'toolCalls'>>
      if (finishReason === 'tool_calls' && toolCalls.length > 0) {
        return toolCallsResponse(toolCalls, { ...extra, reasoningContent: reasoning || undefined })
      }
      if (text) {
        return textResponse(text, { ...extra, reasoningContent: reasoning || undefined })
      }
      if (reasoning) {
        return reasoningResponse(reasoning)
      }
      return textResponse('', { finishReason })
    } catch (e) {
      return this.toErrorResponse(e)
    }
  }
}
