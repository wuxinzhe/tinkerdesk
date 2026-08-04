import OpenAI from 'openai'
import type {ApiMessage, LlmClient, ModelConfig} from '../types'
import type {ToolSchema} from '../../../defines/tools/base-tool'
import {
  textResponse,
  toolCallsResponse,
  reasoningResponse,
  errorResponse,
  ERROR_AUTH_FAILED,
  ERROR_RATE_LIMITED,
  ERROR_CONTEXT_OVERFLOW,
  ERROR_NETWORK_ERROR,
  ERROR_SERVER_ERROR,
  RES_TOOL_CALLS,
  RES_TEXT,
} from '../llm-response'
import type {LlmResponse} from '../types'
import type {TokenCallback} from '../types'
import {finishChunk} from '../streaming-chunk'
import type {ToolCall} from '../../../defines/models/message'

/**
 * openai-client.ts — OpenAI 兼容客户端
 *
 * 对应 showing-agent OpenAiLlmClient：apiMode='openai'。
 * SDK 异常统一捕获并转换为 LlmResponse error 格式。
 */
export class OpenAIClient implements LlmClient {
  readonly apiMode = 'openai' as const

  /** 消息 → OpenAI messages */
  private toOpenAIMessages(messages: ApiMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.map((m) => {
      const base = {role: m.role, content: m.content} as OpenAI.Chat.Completions.ChatCompletionMessageParam
      if (m.role === 'tool') {
        return {...base, tool_call_id: m.toolCallId ?? ''} as OpenAI.Chat.Completions.ChatCompletionMessageParam
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
    const err = e as {status?: number; message?: string; headers?: Record<string, string>}
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
    const client = new OpenAI({apiKey: config.apiKey, baseURL: config.baseUrl, timeout: 60000})
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
            const fn = (tc as {function?: {name: string; arguments?: string}}).function
            return {
              id: tc.id,
              name: fn?.name ?? '',
              arguments: JSON.parse(fn?.arguments ?? '{}') as Record<string, unknown>,
              status: 'completed' as const,
            }
          })
        return toolCallsResponse(toolCalls, {finishReason: finish ?? 'stop'})
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
      return textResponse('', {finishReason: finish ?? 'stop'})
    } catch (e) {
      return this.toErrorResponse(e)
    }
  }

  /** 流式调用 */
  async callStreaming(config: ModelConfig, messages: ApiMessage[], tools: ToolSchema[], tokenCallback: TokenCallback): Promise<LlmResponse> {
    const client = new OpenAI({apiKey: config.apiKey, baseURL: config.baseUrl, timeout: 60000})
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

      for await (const chunk of stream) {
        const choice = chunk.choices[0]
        if (!choice) {
          continue
        }
        const delta = choice.delta as Record<string, unknown>

        // 文本增量
        if (typeof delta.content === 'string' && delta.content) {
          text += delta.content
          tokenCallback({text: delta.content, reasoning: '', toolCallArgs: '', isFinish: false})
        }
        // 推理增量（DeepSeek reasoning_content）
        if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
          reasoning += delta.reasoning_content
          tokenCallback({text: '', reasoning: delta.reasoning_content, toolCallArgs: '', isFinish: false})
        }
        // 工具调用增量
        const toolCallsDelta = delta.tool_calls as Array<{function?: {arguments?: string}}> | undefined
        if (toolCallsDelta) {
          for (const tc of toolCallsDelta) {
            if (tc.function?.arguments) {
              tokenCallback({text: '', reasoning: '', toolCallArgs: tc.function.arguments, isFinish: false})
            }
          }
        }
        if (choice.finish_reason) {
          finishReason = choice.finish_reason
        }
      }

      tokenCallback(finishChunk(finishReason))
      return text ? textResponse(text, {finishReason}) : reasoningResponse(reasoning)
    } catch (e) {
      return this.toErrorResponse(e)
    }
  }
}
