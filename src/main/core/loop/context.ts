/**
 * context.ts — TinkerAgent 三级上下文工厂
 *
 * 类型定义（AgentConfig / ClientEnv / SessionContext / ConversationContext / ToolContext）
 * 已集中到 ./types.ts，本文件只保留工厂函数。
 *
 * 层级：
 *   SessionContext（会话级）→ ConversationContext（周期级，继承）→ ToolContext（工具执行级）
 */
import type { ModelConfig, ToolCall } from '../llm/types'
import { SCENE_CHAT } from '../llm/types'
import type { ConversationContext, SessionContext, ToolContext } from './types'

export type {
  AgentConfig,
  ClientEnv, ConversationContext, SessionContext, ToolContext
} from './types'

/** 从 SessionContext 创建对话周期上下文（显式组合最小字段——不整份复制） */
export function buildConvCtx(
  session: SessionContext,
  conversationId: string,
  toolNames: string[],
  modelConfigs: Map<string, ModelConfig[]>
): ConversationContext {
  return {
    sessionId: session.sessionId,
    profile: session.profile,
    agentConfig: session.agentConfig,
    clientEnv: session.clientEnv,
    yolo: session.yolo,
    ephemeralSystemPrompt: session.ephemeralSystemPrompt,
    agentMode: session.agentMode,
    delegateDepth: session.delegateDepth,
    sender: session.sender,
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
}

/** 从 ConversationContext 创建工具执行上下文（继承字段 + 叠加 toolCall） */
export function buildToolCtx(session: ConversationContext, toolCall: ToolCall, abortSignal?: AbortSignal): ToolContext {
  return {
    ...session,
    toolCall,
    abortSignal,
  }
}
