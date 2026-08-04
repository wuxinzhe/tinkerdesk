/**
 * operation-decision.ts — Operation 判决工厂函数
 *
 * 对应 showing-agent OperationDecision：决定 LlmRouter 的循环行为：
 * - SUCCESS — 接受当前模型结果，返回 LlmResponse
 * - FATAL — 不可重试，立即返回当前 LlmResponse
 * - RETRYABLE — 当前模型输出不可接受，尝试下一模型
 * 类型定义集中在 types.ts，本文件只提供工厂。
 */
import type {OperationDecision} from './types'

export function operationSuccess(): OperationDecision {
  return {verdict: 'SUCCESS'}
}

export function operationFatal(): OperationDecision {
  return {verdict: 'FATAL'}
}

export function operationRetryable(): OperationDecision {
  return {verdict: 'RETRYABLE'}
}
