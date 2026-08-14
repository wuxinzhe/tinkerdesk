/**
 * core/llm/operations/summary-operation.ts — 摘要（压缩）Operation
 *
 * SummaryOperation：
 * - scene = summary
 * - buildInput：原样返回（压缩摘要输入已由 CompactionService 组装）
 * - handle：文本即 SUCCESS
 */
import type { ApiMessage, LlmOperation, LlmResponse, OperationContext, OperationDecision } from '../types'
import type { ToolSchema } from '../../tool/tool-schema'
import { RES_TEXT } from '../llm-response'

/** 摘要场景 */
export const SCENE = 'conversation_compression'

/** 摘要操作 */
export class SummaryOperation implements LlmOperation {
  readonly scene = SCENE
  readonly name = '记忆压缩'

  /** Phase 1: 原样返回 */
  buildInput(_ctx: OperationContext, rawMessages: ApiMessage[], _tools: ToolSchema[]): ApiMessage[] {
    return rawMessages
  }

  /** Phase 3: 文本即成功 */
  handle(response: LlmResponse, _ctx: OperationContext, _rawMessages: ApiMessage[], _tools: ToolSchema[]): OperationDecision {
    if (response.resType === RES_TEXT) {
      return { verdict: 'SUCCESS' }
    }
    return { verdict: 'RETRYABLE' }
  }
}
