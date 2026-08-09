/**
 * google-client.ts — Google Gemini 客户端（@google/genai 官方 SDK）
 *
 * 统一 LlmRequest 入参——针对 Google API 做参数映射：
 * - messages → contents（system 抽离为 systemInstruction）
 * - tools → functionDeclarations
 * - reasoningDepth（low/medium/high 枚举）→ thinkingConfig.thinkingBudget（预算映射与 Anthropic 一致）
 */
import { GoogleGenAI } from '@google/genai'
import type { ToolSchema } from '../../../core/tool/tool-schema'
import {
  ERROR_AUTH_FAILED,
  ERROR_CONTEXT_OVERFLOW,
  ERROR_RATE_LIMITED,
  errorResponse,
  textResponse,
  toolCallsResponse,
} from '../llm-response'
import type { ApiMessage, ChunkCallback, LlmClient, LlmRequest, LlmResponse, ToolCall } from '../types'
import { mapReasoningBudget } from './anthropic-client'

/** Google Gemini 客户端 */
export class GoogleClient implements LlmClient {
  readonly apiMode = 'google' as const

  /** system 消息抽离（Gemini systemInstruction 单独传） */
  private getSystemPrompt(messages: ApiMessage[]): string {
    return messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
  }

  /** ApiMessage → Gemini contents（system 剥离；assistant → model；tool → functionResponse） */
  private toGeminiContents(messages: ApiMessage[]): Array<{ role: string; parts: Array<Record<string, unknown>> }> {
    const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = []
    for (const m of messages) {
      if (m.role === 'system') continue
      if (m.role === 'tool') {
        contents.push({
          role: 'function',
          parts: [{ functionResponse: { name: m.name ?? '', response: { content: m.content } } }],
        })
        continue
      }
      const role = m.role === 'assistant' ? 'model' : 'user'
      const parts: Array<Record<string, unknown>> = [{ text: m.content }]
      if (m.toolCall) {
        const calls = JSON.parse(m.toolCall) as Array<{ id?: string; name: string; arguments: Record<string, unknown> }>
        for (const c of calls) {
          parts.push({ functionCall: { name: c.name, args: c.arguments } })
        }
      }
      contents.push({ role, parts })
    }
    return contents
  }

  /** ToolSchema → Gemini functionDeclarations */
  private toGeminiTools(tools: ToolSchema[]): Array<{ functionDeclarations: Array<{ name: string; description: string; parameters: Record<string, unknown> }> }> {
    return [{
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description ?? '',
        parameters: t.parameters as Record<string, unknown>,
      })),
    }]
  }

  /** 非流式调用 */
  async callNonStreaming(request: LlmRequest): Promise<LlmResponse> {
    const { config } = request
    try {
      const ai = new GoogleGenAI({ apiKey: config.apiKey })
      const response = await ai.models.generateContent({
        model: config.modelName,
        contents: this.toGeminiContents(request.messages),
        config: {
          systemInstruction: this.getSystemPrompt(request.messages) || undefined,
          tools: request.tools.length > 0 ? this.toGeminiTools(request.tools) : undefined,
          // 推理深度（预算派：枚举 → thinkingBudget）
          ...(request.reasoningDepth ? { thinkingConfig: { thinkingBudget: mapReasoningBudget(request.reasoningDepth) } } : {}),
        },
      })

      // 工具调用解析（functionCall parts）
      const toolCalls: ToolCall[] = []
      let text = ''
      const parts = response.candidates?.[0]?.content?.parts ?? []
      for (const part of parts) {
        if (part.functionCall) {
          toolCalls.push({
            id: part.functionCall.id ?? '',
            name: part.functionCall.name ?? '',
            arguments: (part.functionCall.args as Record<string, unknown>) ?? {},
            status: 'completed' as const,
          })
        } else if (part.text) {
          text += part.text
        }
      }

      if (toolCalls.length > 0) {
        return toolCallsResponse(toolCalls, { text: text || undefined })
      }
      if (text) {
        return textResponse(text, {
          promptTokens: response.usageMetadata?.promptTokenCount,
          completionTokens: response.usageMetadata?.candidatesTokenCount,
        })
      }
      return textResponse('', {})
    } catch (e) {
      return this.toErrorResponse(e)
    }
  }

  /** 流式调用：转发 token 的同时缓存拼装完整 LlmResponse */
  async callStreaming(request: LlmRequest, onToken: ChunkCallback): Promise<LlmResponse> {
    const { config } = request
    try {
      const ai = new GoogleGenAI({ apiKey: config.apiKey })
      const stream = await ai.models.generateContentStream({
        model: config.modelName,
        contents: this.toGeminiContents(request.messages),
        config: {
          systemInstruction: this.getSystemPrompt(request.messages) || undefined,
          tools: request.tools.length > 0 ? this.toGeminiTools(request.tools) : undefined,
          // 推理深度（预算派：枚举 → thinkingBudget）
          ...(request.reasoningDepth ? { thinkingConfig: { thinkingBudget: mapReasoningBudget(request.reasoningDepth) } } : {}),
        },
      })

      let text = ''
      const reasoning = ''
      const toolCalls: ToolCall[] = []
      for await (const chunk of stream) {
        const parts = chunk.candidates?.[0]?.content?.parts ?? []
        for (const part of parts) {
          if (part.functionCall) {
            toolCalls.push({
              id: part.functionCall.id ?? '',
              name: part.functionCall.name ?? '',
              arguments: (part.functionCall.args as Record<string, unknown>) ?? {},
              status: 'completed' as const,
            })
            onToken({ text: '', reasoning: '', toolCallArgs: JSON.stringify(part.functionCall.args ?? {}), isFinish: false })
          } else if (part.text) {
            text += part.text
            onToken({ text: part.text, reasoning: '', toolCallArgs: '', isFinish: false })
          }
        }
        const meta = (chunk as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata
        if (meta) {
          void meta
        }
      }
      if (toolCalls.length > 0) {
        onToken({ text: '', reasoning: '', toolCallArgs: '', isFinish: true })
        return toolCallsResponse(toolCalls, { text: text || undefined })
      }
      if (text || reasoning) {
        onToken({ text: '', reasoning: '', toolCallArgs: '', isFinish: true })
        return textResponse(text, {})
      }
      onToken({ text: '', reasoning: '', toolCallArgs: '', isFinish: true })
      return textResponse('', {})
    } catch (e) {
      return this.toErrorResponse(e)
    }
  }

  /** Gemini API 错误 → 统一 error 响应 */
  private toErrorResponse(e: unknown): LlmResponse {
    const err = e as { status?: number; code?: number; message?: string }
    const message = err.message ?? '未知错误'
    const status = err.status ?? err.code ?? 0
    switch (status) {
      case 401:
      case 403:
        return errorResponse(ERROR_AUTH_FAILED, `认证失败: ${message}`)
      case 429:
        return errorResponse(ERROR_RATE_LIMITED, `请求被限流: ${message}`)
      case 400: {
        const lower = message.toLowerCase()
        if (lower.includes('context') || lower.includes('length') || lower.includes('token') || lower.includes('maximum')) {
          return errorResponse(ERROR_CONTEXT_OVERFLOW, `上下文超限: ${message}`)
        }
        return errorResponse(ERROR_CONTEXT_OVERFLOW, `请求参数错误: ${message}`)
      }
      default:
        return errorResponse('llm:client:error', `Google API 调用失败: ${message}`)
    }
  }
}
