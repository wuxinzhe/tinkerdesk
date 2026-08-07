import Anthropic from '@anthropic-ai/sdk'
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
  toolCallsResponse,
} from '../llm-response'
import type { ApiMessage, ChunkCallback, LlmClient, LlmResponse, ModelConfig, ToolCall } from '../types'

/**
 * anthropic-client.ts — Anthropic 客户端
 *
 * 对应 tinker-agent AnthropicLlmClient：apiMode='anthropic'。
 * 使用 Claude 原生 Messages API，工具 schema 从 OpenAI 格式转换。
 */
export class AnthropicClient implements LlmClient {
  readonly apiMode = 'anthropic' as const

  /** system 消息单独提取 */
  private getSystemPrompt(messages: ApiMessage[]): string {
    return messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
  }

  /** 非 system 消息 → Anthropic messages */
  private toAnthropicMessages(messages: ApiMessage[]): Anthropic.MessageParam[] {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
  }

  /** OpenAI 工具 schema → Anthropic tools */
  private toAnthropicTools(tools: ToolSchema[]): Anthropic.Tool[] {
    return tools.map((t) => {
      const fn = t.function
      return {
        name: fn.name,
        description: fn.description,
        input_schema: fn.parameters as Anthropic.Tool['input_schema'],
      }
    })
  }

  /** SDK 异常 → LlmResponse error */
  private toErrorResponse(e: unknown): LlmResponse {
    const err = e as { status?: number; message?: string }
    const message = err.message ?? '未知错误'
    switch (err.status) {
      case 401:
      case 403:
        return errorResponse(ERROR_AUTH_FAILED, `认证失败: ${message}`)
      case 429:
        return errorResponse(ERROR_RATE_LIMITED, `请求被限流: ${message}`)
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
    const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl, timeout: 60000 })
    try {
      const message = await client.messages.create({
        model: config.modelName,
        messages: this.toAnthropicMessages(messages),
        system: this.getSystemPrompt(messages),
        max_tokens: 4096,
        tools: tools.length > 0 ? this.toAnthropicTools(tools) : undefined,
      })

      let text = ''
      const toolCalls: ToolCall[] = []
      for (const block of message.content) {
        if (block.type === 'text') {
          text += block.text
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input as Record<string, unknown>,
            status: 'completed' as const,
          })
        }
      }

      if (toolCalls.length > 0) {
        return toolCallsResponse(toolCalls, {
          finishReason: message.stop_reason ?? 'stop',
          text: text || undefined,
        })
      }
      return textResponse(text, {
        finishReason: message.stop_reason ?? 'stop',
        promptTokens: message.usage.input_tokens,
        completionTokens: message.usage.output_tokens,
      })
    } catch (e) {
      return this.toErrorResponse(e)
    }
  }

  /** 流式调用：转发 token 的同时缓存拼装完整 LlmResponse（含工具调用，对齐 Java AnthropicLlmClient） */
  async callStreaming(config: ModelConfig, messages: ApiMessage[], tools: ToolSchema[], onToken: ChunkCallback): Promise<LlmResponse> {
    const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl, timeout: 60000 })
    try {
      const stream = await client.messages.create({
        model: config.modelName,
        messages: this.toAnthropicMessages(messages),
        system: this.getSystemPrompt(messages),
        max_tokens: 4096,
        tools: tools.length > 0 ? this.toAnthropicTools(tools) : undefined,
        stream: true,
      })

      let text = ''
      let reasoning = ''
      let finishReason: string | undefined
      // 工具调用累积：block index → {id, name, input 增量}
      const toolAccum = new Map<number, { id: string; name: string; input: string }>()

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          // tool_use 块开始：记录 id/name
          if (event.content_block.type === 'tool_use') {
            const idx = event.index ?? 0
            toolAccum.set(idx, { id: event.content_block.id, name: event.content_block.name, input: '' })
          }
        } else if (event.type === 'content_block_delta') {
          const idx = event.index ?? 0
          if (event.delta.type === 'text_delta') {
            text += event.delta.text
            onToken({ text: event.delta.text, reasoning: '', toolCallArgs: '', isFinish: false })
          } else if (event.delta.type === 'thinking_delta') {
            // 推理增量：转发 + 累积
            reasoning += event.delta.thinking
            onToken({ text: '', reasoning: event.delta.thinking, toolCallArgs: '', isFinish: false })
          } else if (event.delta.type === 'input_json_delta') {
            // 工具参数增量：转发 + 按 index 累积
            const acc = toolAccum.get(idx)
            if (acc) {
              acc.input += event.delta.partial_json ?? ''
              toolAccum.set(idx, acc)
            }
            if (event.delta.partial_json) {
              onToken({ text: '', reasoning: '', toolCallArgs: event.delta.partial_json, isFinish: false })
            }
          }
        } else if (event.type === 'message_delta' && event.delta.stop_reason) {
          finishReason = event.delta.stop_reason
        }
      }

      onToken({ text: '', reasoning: '', toolCallArgs: '', isFinish: true, finishReason })

      // ── 组装完整 LlmResponse（对齐 Java：tool_use → text → reasoning → empty）──
      const toolCalls: ToolCall[] = [...toolAccum.entries()]
        .sort(([a], [b]) => a - b)
        .filter(([, acc]) => acc.name !== '')
        .map(([, acc]) => ({
          id: acc.id || `toolu_${acc.name}`,
          name: acc.name,
          arguments: safeParseJson(acc.input),
          status: 'completed' as const,
        }))

      const extra = { finishReason } as Partial<Omit<LlmResponse, 'resType' | 'text' | 'toolCalls'>>
      if (toolCalls.length > 0) {
        return toolCallsResponse(toolCalls, { ...extra, text: text || undefined, reasoningContent: reasoning || undefined })
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
