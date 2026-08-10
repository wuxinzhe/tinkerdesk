/**
 * core/llm/operations/vision-operation.ts — 图像识别操作
 *
 * - scene = image_recognition（SCENE_VISION）
 * - 裸调用：buildInput 原样返回消息（含多模态 content 数组——text + image_url）
 *   ——视觉调用不需要系统 prompt/工具注入——问题+图片就是全部输入
 * - 结果处理：成功即完成；错误可重试（走 llm-router 的模型回退循环）
 */
import type { ApiMessage, LlmOperation, LlmResponse, OperationContext, OperationDecision } from '../types'
import { isSuccess } from '../llm-response'
import type { ToolSchema } from '../../tool/tool-schema'
import { SCENE_VISION } from '../types'

/** 图像识别操作 */
export class VisionOperation implements LlmOperation {
  readonly scene = SCENE_VISION
  readonly name = '图像识别'

  /** Phase 1: 原样返回（调用方已构造多模态消息——不加系统 prompt） */
  buildInput(_ctx: OperationContext, rawMessages: ApiMessage[], _tools: ToolSchema[]): ApiMessage[] {
    return rawMessages
  }

  /** Phase 3: 成功即完成，其余可重试（回退到备用模型） */
  handle(response: LlmResponse, _ctx: OperationContext, _rawMessages: ApiMessage[], _tools: ToolSchema[]): OperationDecision {
    if (isSuccess(response)) {
      return { verdict: 'SUCCESS' }
    }
    return { verdict: 'RETRYABLE' }
  }
}
