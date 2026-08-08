/**
 * core/llm/operations/chat-operation.ts — 主对话 Operation
 *
 * 复刻 tinker-agent ChatOperation：
 * - scene = chat
 * - buildInput：原样返回（主对话不改造输入，messages 已由 TinkerAgent 组装）
 * - handle：成功即 SUCCESS（错误由 TinkerAgent 分支处理）
 */
import type { ApiMessage, LlmOperation, LlmResponse, OperationContext, OperationDecision } from '../types'
import type { ToolSchema } from '../../tool/tool-schema'
import { RES_TEXT, RES_TOOL_CALLS, RES_REASONING } from '../llm-response'

/** 主对话场景 */
export const SCENE = 'main_conversation'

/** 主对话操作 */
export class ChatOperation implements LlmOperation {
  readonly scene = SCENE
  readonly name = '主对话'

  /** Phase 1: 原样返回（输入已由 TinkerAgent 组装好） */
  buildInput(_ctx: OperationContext, rawMessages: ApiMessage[], _tools: ToolSchema[]): ApiMessage[] {
    return rawMessages
  }

  /** Phase 3: 成功即完成，其余交给 TinkerAgent 分支处理 */
  handle(response: LlmResponse, _ctx: OperationContext, _rawMessages: ApiMessage[], _tools: ToolSchema[]): OperationDecision {
    if (response.resType === RES_TEXT || response.resType === RES_TOOL_CALLS || response.resType === RES_REASONING) {
      return { verdict: 'SUCCESS' }
    }
    return { verdict: 'RETRYABLE' }
  }
}
