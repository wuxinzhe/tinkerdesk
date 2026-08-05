/**
 * types.ts — AgentLoop 统一类型定义
 *
 * 只放类型定义（接口），实现集中在 agent-loop.ts。
 * 复刻 showing-agent ConversationEngine 相关接口（线程模型版）。
 */
import type {LlmRouter} from '../llm/llm-router'
import type {ToolManager} from '../tools/tool-manager'
import type {LlmResponse, ModelConfig} from '../llm/types'
import type {PromptModuleBuilder} from '../prompt/prompt-module-builder'
import type {CompactionService} from '../service/compaction-service'
import type {ConversationService} from '../service/conversation-service'
import type {MessageService} from '../service/message-service'
import type {SessionService} from '../service/session-service'

/** 主对话场景（对应 SCENE_CHAT） */
export const SCENE_CHAT = 'chat'

/** 对话状态常量 */
export const CONV_IN_PROGRESS = 'IN_PROGRESS'
export const CONV_COMPLETED = 'COMPLETED'
export const CONV_COMPRESSED = 'COMPRESSED'

/** 引擎层响应类型（AgentLoop 内部产生的非 LLM 响应） */
export const RES_INTERRUPTED = 'INTERRUPTED'

/** AgentLoop 构造参数 */
export interface AgentLoopOptions {
  llmRouter: LlmRouter
  toolManager: ToolManager
  messageService: MessageService
  sessionService: SessionService
  conversationService: ConversationService
  compactionService: CompactionService
  promptModuleBuilder: PromptModuleBuilder
  /** 解析场景 → 候选模型配置列表（从 custom_models + providers 组装） */
  resolveModelConfigs: (scene: string) => ModelConfig[]
}

/** 单轮对话结果 */
export interface AgentLoopResult {
  response: LlmResponse
  sessionId: string
  conversationId: string
}
