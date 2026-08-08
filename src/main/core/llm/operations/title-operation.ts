/**
 * core/llm/operations/title-operation.ts — 对话标题生成操作
 *
 * 复刻 tinker-agent TitleOperation：
 * - scene = title_generation
 * - 提取首条 user 消息 → 渲染 title.hbs → LLM 调用 → 返回标题
 */
import type { ApiMessage, LlmOperation, LlmResponse, OperationContext, OperationDecision } from '../types'
import { isSuccess } from '../llm-response'
import type { ToolSchema } from '../../tool/tool-schema'
import type { PromptRenderer } from '../../prompt/renderer'

/** 标题生成场景 */
export const SCENE = 'title_generation'

/** 标题生成操作 */
export class TitleOperation implements LlmOperation {
  readonly scene = SCENE
  readonly name = '标题生成'

  constructor(private readonly promptRenderer: PromptRenderer) {}

  /** Phase 1: 提取首条 user 消息 → 渲染标题模板 */
  buildInput(_ctx: OperationContext, rawMessages: ApiMessage[], _tools: ToolSchema[]): ApiMessage[] {
    const userMsg = rawMessages.find((m) => m.role === 'user')?.content ?? ''
    if (!userMsg || userMsg.trim() === '') {
      return []
    }
    const systemMsg = this.promptRenderer.render('title', {})
    return [
      { role: 'system', content: systemMsg },
      { role: 'user', content: userMsg },
    ]
  }

  /** Phase 3: 成功即完成，其余可重试 */
  handle(response: LlmResponse, _ctx: OperationContext, _rawMessages: ApiMessage[], _tools: ToolSchema[]): OperationDecision {
    if (isSuccess(response)) {
      return { verdict: 'SUCCESS' }
    }
    return { verdict: 'RETRYABLE' }
  }
}
