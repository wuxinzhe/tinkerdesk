/**
 * llm-router.ts — LLM 路由：按场景分发到 Operation + 多模型回退
 *
 * 复刻 showing-agent LlmOrchestrator：
 * - LlmRouterOptions 装载全部调用参数（scene/messages/tools/modelConfigs 数据）
 * - 模型回退：按 modelConfigs 顺序逐个尝试，Operation 判决决定是否回退
 */
import type { ApiMessage, CallFn, ChunkCallback, LlmResponse, LlmRouterOptions, OperationContext } from './types'
import { errorResponse, ERROR_ALL_MODELS_FAILED, ERROR_INVALID_REQUEST, isSuccess } from './llm-response'
import type { ToolSchema } from '../tool/tool-schema'
import type { LlmClientManager } from './llm-client-manager'
import type { LlmOperationManager } from './llm-operation-manager'

/** LLM 路由器 */
export class LlmRouter {
  constructor(
    private readonly clientManager: LlmClientManager,
    private readonly operationManager: LlmOperationManager
  ) {}

  /**
   * 流式调用 LLM，支持模型回退。
   * 每个 chunk 通过 tokenCallback 实时转发，最终返回完整 LlmResponse。
   */
  async chat(options: LlmRouterOptions, onToken: ChunkCallback): Promise<LlmResponse> {
    return this.caller(options, async (config, input) => {
      const client = this.clientManager.getClient(config)
      return client.callStreaming(config, input, options.tools, onToken)
    })
  }

  /** 非流式执行完整的 LLM 调用流程（含模型回退循环） */
  async execute(options: LlmRouterOptions): Promise<LlmResponse> {
    return this.caller(options, async (config, input) => {
      const client = this.clientManager.getClient(config)
      return client.callNonStreaming(config, input, options.tools)
    })
  }

  /** 统一执行入口：Phase 1 → Phase 2 + Phase 3（循环） */
  private async caller(options: LlmRouterOptions, callFn: CallFn): Promise<LlmResponse> {
    const { scene, messages, tools, modelConfigs } = options
    const op = this.operationManager.getOperation(scene)
    const configs = modelConfigs
    if (!configs || configs.length === 0) {
      console.warn(`场景 ${scene} 未配置模型`)
      return errorResponse(ERROR_ALL_MODELS_FAILED, `场景 ${scene} 未配置模型`)
    }

    // Phase 1: 构建输入（options 作为 OperationContext 传给 Operation）
    const opCtx = options as unknown as OperationContext
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
