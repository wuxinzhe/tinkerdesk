/**
 * llm-router.ts — LLM 路由：按场景分发到 Operation + 多模型回退
 *
 * - LlmRouterOptions 装载全部调用参数（scene/messages/tools/modelConfigs 数据）
 * - 模型回退：按 modelConfigs 顺序逐个尝试，Operation 判决决定是否回退
 */
import type { LlmClientManager } from './llm-client-manager'
import type { LlmOperationManager } from './llm-operation-manager'
import { sanitizeApiMessages } from './message-utils'
import { ERROR_ALL_MODELS_FAILED, ERROR_INVALID_REQUEST, ERROR_RATE_LIMITED, errorResponse, isSuccess } from './llm-response'
import type { CallFn, ChunkCallback, LlmResponse, LlmRouterOptions, OperationContext } from './types'
import { usageRecorder } from './usage-recorder'
import { eventRecorder } from '../../service/event-recorder'
import { randomUUID } from 'crypto'

/** 同一模型本地重试上限（限流/网络错误——瞬时故障重试一次大概率成功） */
const MAX_LOCAL_ATTEMPTS = 2
/** 网络错误快退避（毫秒——第 1 次失败后等待 2s，第 2 次 4s） */
const NETWORK_RETRY_WAIT_MS = 2_000
/** 限流等待（毫秒——429 是瞬时组织级限额——等 15s 重试同一模型） */
const RATE_LIMIT_WAIT_MS = 15_000

/** 等待（毫秒） */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** LLM 路由器 */
export class LlmRouter {
  constructor(
    private readonly clientManager: LlmClientManager,
    private readonly operationManager: LlmOperationManager
  ) { }

  /**
   * 流式调用 LLM，支持模型回退。
   * 每个 chunk 通过 tokenCallback 实时转发，最终返回完整 LlmResponse。
   */
  async chat(options: LlmRouterOptions, onToken: ChunkCallback): Promise<LlmResponse> {
    return this.caller(options, async (config, input) => {
      const client = this.clientManager.getClient(config)
      return client.callStreaming({ config, messages: input, tools: options.tools, reasoningDepth: options.reasoningDepth, signal: options.signal }, onToken)
    })
  }

  /** 非流式执行完整的 LLM 调用流程（含模型回退循环） */
  async execute(options: LlmRouterOptions): Promise<LlmResponse> {
    return this.caller(options, async (config, input) => {
      const client = this.clientManager.getClient(config)
      return client.callNonStreaming({ config, messages: input, tools: options.tools, reasoningDepth: options.reasoningDepth })
    })
  }

  /** 统一执行入口：Phase 1 → Phase 2 + Phase 3（循环） */
  private async caller(options: LlmRouterOptions, callFn: CallFn): Promise<LlmResponse> {
    const { scene, messages, tools, modelConfigs } = options
    const op = this.operationManager.getOperation(scene)
    const configs = modelConfigs
    // usage 统计：请求级唯一 id（幂等键）+ 开始时刻（耗时）
    const requestId = randomUUID()
    const startedAt = Date.now()
    const recordUsage = (modelName: string, status: 'success' | 'failed', response?: LlmResponse): void => {
      usageRecorder.record({
        requestId,
        profile: options.profile,
        conversationId: options.conversationId,
        sessionId: options.sessionId,
        modelName,
        scene,
        status,
        promptTokens: response?.promptTokens,
        completionTokens: response?.completionTokens,
        cacheReadTokens: response?.cacheReadTokens,
        cacheWriteTokens: response?.cacheWriteTokens,
        latencyMs: Date.now() - startedAt,
      })
    }
    if (!configs || configs.length === 0) {
      console.warn(`场景 ${scene} 未配置模型`)
      return errorResponse(ERROR_ALL_MODELS_FAILED, `场景 ${scene} 未配置模型`)
    }

    // Phase 1: 构建输入（options 作为 OperationContext 传给 Operation）
    const opCtx = options as unknown as OperationContext
    // 发送前防御性修复（Hermes sanitize_api_messages——注入缺失 tool 结果 stub——
    // 严格 provider 400 "tool_calls must be followed by tool messages" 根治）
    const input = sanitizeApiMessages(op.buildInput(opCtx, messages, tools))
    if (!input || input.length === 0) {
      return errorResponse(ERROR_INVALID_REQUEST, 'input 为空')
    }

    // Phase 2 + Phase 3: 模型调用 + 回退循环（限流/网络错误本地重试——瞬时故障不立即判死）
    for (let i = 0; i < configs.length; i++) {
      const config = configs[i]
      let localAttempt = 0
      while (localAttempt < MAX_LOCAL_ATTEMPTS) {
        localAttempt++
        console.log(`model=${config.modelName} attempt=${i + 1}/${configs.length}`)
        eventRecorder.record({
          sessionId: options.sessionId ?? '',
          conversationId: options.conversationId,
          eventType: 'llm',
          eventName: 'request',
          payload: { model: config.modelName, scene, attempt: localAttempt, inputMessages: input.length },
        })

        let response: LlmResponse
        try {
          // ── DEBUG：发送前 dump 上下文尾部（定位 tool_calls 配对 400） ──
          if (process.env.TK_DEBUG_CTX === '1') {
            const tail = input.slice(-6).map((m) => {
              const tc = typeof m.toolCall === 'string' && m.toolCall ? JSON.parse(m.toolCall) : (m.toolCall ?? null)
              return `${m.role}${m.toolCallId ? `[tool=${m.toolCallId.slice(0, 18)}]` : ''}${tc ? `[calls=${Object.keys(tc).join(',')}]` : ''}`
            })
            console.log(`[ctx-debug] model=${config.modelName} 尾部消息: ${tail.join(' → ')}`)
          }
          response = await callFn(config, input)
        } catch (e) {
          // 调用异常（网络错误等——瞬时）→ 本地快退避重试
          console.warn(`模型 ${config.modelName} 调用异常（${(e as Error).message}），本地重试 ${localAttempt}/${MAX_LOCAL_ATTEMPTS}`)
          eventRecorder.record({
            sessionId: options.sessionId ?? '',
            conversationId: options.conversationId,
            eventType: 'llm',
            eventName: 'retry',
            payload: { model: config.modelName, attempt: localAttempt, reason: (e as Error).message.slice(0, 200) },
          })
          if (localAttempt < MAX_LOCAL_ATTEMPTS) {
            await sleep(NETWORK_RETRY_WAIT_MS * localAttempt)
            continue
          }
          break
        }

        if (isSuccess(response)) {
          console.log(`action=LLM_RESPONSE model=${config.modelName} tokens=${response.promptTokens ?? 0}`)
          eventRecorder.record({
            sessionId: options.sessionId ?? '',
            conversationId: options.conversationId,
            eventType: 'llm',
            eventName: 'response',
            payload: {
              model: config.modelName,
              scene,
              finishReason: response.finishReason ?? '',
              resType: response.resType,
              retryCount: localAttempt - 1,
              promptTokens: response.promptTokens,
              completionTokens: response.completionTokens,
              cacheReadTokens: response.cacheReadTokens,
              cacheWriteTokens: response.cacheWriteTokens,
              latencyMs: Date.now() - startedAt,
              // 最终文本（完整——对照流式拼接——判断重复在返回层还是累积层）
              text: typeof response.text === 'string' ? response.text : '',
            },
          })
        }

        // Phase 3: Operation 判决
        const decision = op.handle(response, opCtx, messages, tools)
        switch (decision.verdict) {
          case 'SUCCESS':
            recordUsage(config.modelName, 'success', response)
            return response
          case 'FATAL':
            recordUsage(config.modelName, 'success', response)
            return response
          case 'RETRYABLE': {
            // 限流（429）：瞬时组织级限额——等待退避后重试同一模型（不立即回退）
            if (response.resType === ERROR_RATE_LIMITED && localAttempt < MAX_LOCAL_ATTEMPTS) {
              console.warn(`模型 ${config.modelName} 被限流（429），等待 ${RATE_LIMIT_WAIT_MS}ms 重试同一模型（${localAttempt}/${MAX_LOCAL_ATTEMPTS}）`)
              await sleep(RATE_LIMIT_WAIT_MS)
              continue
            }
            console.warn(`模型 ${config.modelName} 返回 RETRYABLE（类型=${response.resType}${response.errorMessage ? `，原因=${response.errorMessage}` : ''}），回退到下一个`)
            eventRecorder.record({
              sessionId: options.sessionId ?? '',
              conversationId: options.conversationId,
              eventType: 'llm',
              eventName: 'fallback',
              payload: { model: config.modelName, reason: `${response.resType}${response.errorMessage ? `: ${response.errorMessage}` : ''}` },
            })
            break
          }
        }
        break // 非限流/重试耗尽 → 回退下一个模型
      }
    }

    console.error('所有模型配置均已试过，全部失败')
    // 全部失败也记一条（usage 全 0 + status=failed——可用率/失败率统计）
    recordUsage(configs[configs.length - 1]?.modelName ?? 'unknown', 'failed')
    return errorResponse(ERROR_ALL_MODELS_FAILED, '所有可用的模型配置均已试过，全部失败。')
  }
}
