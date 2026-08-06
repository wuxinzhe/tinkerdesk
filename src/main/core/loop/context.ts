/**
 * context.ts — AgentLoop 三级上下文工厂
 *
 * 类型定义（AgentConfig / ClientEnv / SessionContext / ConversationContext / ToolContext）
 * 已集中到 ./types.ts，本文件只保留工厂函数。
 *
 * 层级：
 *   SessionContext（会话级）→ ConversationContext（周期级，继承）→ ToolContext（工具执行级）
 */
import type {ToolCall} from '../llm/types'
import type {ModelConfig} from '../llm/types'
import {SCENE_CHAT} from '../llm/types'
import type {AgentConfig, ConversationContext, SessionContext, ToolContext} from './types'

export type {
  AgentConfig,
  ClientEnv,
  SessionContext,
  ConversationContext,
  ToolContext,
} from './types'

/** 从 SessionContext 创建对话周期上下文 */
export function buildConvCtx(
  session: SessionContext,
  conversationId: string,
  toolNames: string[],
  modelConfigs: Map<string, ModelConfig[]>
): ConversationContext {
  const ctx: ConversationContext = {
    ...session,
    conversationId,
    toolNames,
    modelConfigs,
    getMainModelConfig() {
      const configs = this.modelConfigs.get(SCENE_CHAT)
      return configs && configs.length > 0 ? configs[0] : null
    },
    getConfigByScene(scene: string) {
      const configs = this.modelConfigs.get(scene)
      return configs && configs.length > 0 ? configs[0] : null
    },
  }
  return ctx
}

/** 从 ConversationContext 创建工具执行上下文（继承字段 + 叠加 toolCall） */
export function buildToolCtx(session: ConversationContext, toolCall: ToolCall): ToolContext {
  return {
    ...session,
    toolCall,
  }
}
