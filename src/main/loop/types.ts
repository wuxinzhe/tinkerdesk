/**
 * types.ts — AgentLoop 统一类型定义
 *
 * 只放类型定义（接口），实现集中在 agent-loop.ts。
 * 复刻 showing-agent ConversationEngine 相关接口（线程模型版）。
 */
import type {ToolCall} from '../../defines/models/message'
import type {LlmRouter} from '../llm/llm-router'
import type {ToolManager} from '../tools/tool-manager'
import type {LlmResponse, ModelConfig, TokenCallback} from '../llm/types'
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

/** 单次会话上下文（线程模型：状态保存在这里） */
export interface ThreadSession {
  /** 会话 ID（不传则自动创建） */
  sessionId?: string
  profile: string
  connectId: string
  yolo: boolean
  /** Agent 配置（压缩阈值/尾部保留等，可选，默认 0.5/0.2） */
  agentConfig?: {
    thresholdPercent?: number
    tailRatio?: number
  }
  /** 流式 token 回调（可选） */
  onToken?: TokenCallback
  /** 工具执行进度回调（可选） */
  onToolStart?: (toolName: string) => void
  /** 审批请求回调（可选）：工具需要审批时调用，返回 Promise<boolean> */
  onApprovalRequest?: (toolCall: ToolCall, reason?: string) => Promise<boolean>
  /** 审批回调返回 null/undefined 表示默认允许 */
}

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
