import type { ToolSchema } from '../../defines/tools/base-tool'
import type { LlmClientManager } from './llm-client-manager'
import type { LlmOperationManager } from './llm-operation-manager'
import { ERROR_ALL_MODELS_FAILED, ERROR_INVALID_REQUEST, errorResponse, isSuccess } from './llm-response'
import type { ApiMessage, CallFn, ChunkCallback, LlmResponse, LlmRouterContext, OperationContext } from './types'

/**
 * llm-router.ts — LLM 调用路由器
 *
 * 对应 showing-agent LlmRouter：支持模型回退和 Operation 三阶段流程。
 * - Phase 1 (buildInput)：Operation 构建请求消息列表
 * - Phase 2 (模型调用 + 回退)：按模型配置列表依序尝试
 * - Phase 3 (handle)：Operation 判决结果（SUCCESS/FATAL/RETRYABLE）
 */

export class LlmRouter {
  constructor(private readonly clientManager: LlmClientManager,
    private readonly operationManager: LlmOperationManager) { }

  /**
   * 流式调用 LLM，支持模型回退。
   * 每个 chunk 通过 tokenCallback 实时转发，最终返回完整 LlmResponse。
   */
  async chat(scene: string, ctx: LlmRouterContext, messages: ApiMessage[], tools: ToolSchema[], onToken: ChunkCallback): Promise<LlmResponse> {
    return this.caller(scene, ctx, messages, tools, async (config, input) => {
      const client = this.clientManager.getClient(config)
      return client.callStreaming(config, input, tools, onToken)
    })
  }

  /** 非流式执行完整的 LLM 调用流程（含模型回退循环） */
  async execute(scene: string, ctx: LlmRouterContext, messages: ApiMessage[], tools: ToolSchema[]): Promise<LlmResponse> {
    return this.caller(scene, ctx, messages, tools, async (config, input) => {
      const client = this.clientManager.getClient(config)
      return client.callNonStreaming(config, input, tools)
    })
  }

  /** 统一执行入口：Phase 1 → Phase 2 + Phase 3（循环） */
  private async caller(scene: string, ctx: LlmRouterContext, messages: ApiMessage[], tools: ToolSchema[], callFn: CallFn): Promise<LlmResponse> {
    const op = this.operationManager.getOperation(scene)
    const configs = ctx.getModelConfigs(scene)
    if (!configs || configs.length === 0) {
      console.warn(`场景 ${scene} 未配置模型`)
      return errorResponse(ERROR_ALL_MODELS_FAILED, `场景 ${scene} 未配置模型`)
    }

    // Phase 1: 构建输入（ctx 作为 OperationContext 传给 Operation）
    const opCtx = ctx as unknown as OperationContext
    const input = op.buildInput(opCtx, messages, tools)
    if (!input || input.length === 0) {
      return errorResponse(ERROR_INVALID_REQUEST, 'input 为空')
    }

    // Phase 2 + Phase 3: 模型调用 + 回退循环
    for (let i = 0; i < configs.length; i++) {
      const config = configs[i]
      console.log(`model=${config.modelName} attempt=${i + 1}/${configs.length}`)

      let response: LlmResponse
      try {
        response = await callFn(config, input)
      } catch (e) {
        console.warn(`模型 ${config.modelName} 调用异常（${(e as Error).message}），回退到下一个`)
        continue
      }

      if (isSuccess(response)) {
        console.log(`action=LLM_RESPONSE model=${config.modelName} tokens=${response.promptTokens ?? 0}`)
      }

      // Phase 3: Operation 判决
      const decision = op.handle(response, opCtx, messages, tools)
      switch (decision.verdict) {
        case 'SUCCESS':
          return response
        case 'FATAL':
          return response
        case 'RETRYABLE':
          console.warn(`模型 ${config.modelName} 返回 RETRYABLE（类型=${response.resType}），回退到下一个`)
        // continue
      }
    }

    console.error('所有模型配置均已试过，全部失败')
    return errorResponse(ERROR_ALL_MODELS_FAILED, '所有可用的模型配置均已试过，全部失败。')
  }
}
