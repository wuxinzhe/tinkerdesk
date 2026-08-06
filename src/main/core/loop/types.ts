/**
 * types.ts — AgentLoop 统一类型定义
 *
 * 只放类型定义（接口），实现集中在 agent-loop.ts。
 * 复刻 tinker-agent ConversationEngine 相关接口（线程模型版）。
 */
import type {LlmRouter} from '../llm/llm-router'
import type {AgentActionType} from './constants'
import type {ToolManager} from '../tool/tool-manager'
import type {LlmResponse, ModelConfig} from '../llm/types'
import type {LlmChunk} from '../llm/types'
import type {IAgentMode} from '../mode/agent-mode'
import type {PromptModuleBuilder} from '../prompt/prompt-module-builder'
import type {CompactionService} from '../../service/compaction-service'
import type {ModelConfigService} from '../../service/model-config-service'
import type {ConversationService} from '../../service/conversation-service'
import type {MessageService} from '../../service/message-service'
import type {SessionService} from '../../service/session-service'
import type {SandboxWhitelistService} from '../../service/sandbox-whitelist-service'
import type {ToolAuthService} from '../../service/tool-auth-service'
import type {ToolCall} from '../llm/types'

/** 主对话场景（单一来源在 core/llm/types，此处不再重复定义） */

/** 对话状态常量（单一来源在 core/constants/conversation，此处 re-export） */
export { CONV_IN_PROGRESS, CONV_COMPLETED, CONV_COMPRESSED } from '../constants/conversation'

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
  /** 模型配置解析服务（custom_models + providers → ModelConfig[]） */
  modelConfigService: ModelConfigService
  /** 沙盒白名单服务（工具门检：URL/路径白名单） */
  sandboxWhitelistService: SandboxWhitelistService
  /** 工具授权服务（工具门检：危险参数检测） */
  toolAuthService: ToolAuthService
}

/** 单轮对话结果 */
export interface AgentLoopResult {
  response: LlmResponse
  sessionId: string
  conversationId: string
}

// ── 三级上下文（对齐 tinker-agent SessionContext → ConversationContext → ToolContext） ──

/** Agent 配置（会话级，对齐 tinker-agent AgentConfig） */
export interface AgentConfig {
  /** 最大迭代次数（LLM↔工具循环），0 = 不限 */
  maxIterations: number
  /** 上下文压缩触发阈值（0-1） */
  thresholdPercent: number
  /** 压缩时保留尾部消息比例 */
  tailRatio: number
  /** 工具执行超时（秒） */
  toolExecutionTimeout: number
  /** 最大并发会话数 */
  maxConversations: number
  /** 记忆最大字符数 */
  memoryMaxChars: number
  /** 用户消息最大字符数 */
  userMaxChars: number
  /** 是否启用警告 */
  warningsEnabled: boolean
  /** 是否启用硬停止 */
  hardStopEnabled: boolean
  /** 工具循环护栏：警告阈值 */
  exactFailureWarnAfter: number
  sameToolFailureWarnAfter: number
  noProgressWarnAfter: number
  /** 工具循环护栏：硬封锁阈值 */
  exactFailureBlockAfter: number
  sameToolFailureHaltAfter: number
  noProgressBlockAfter: number
  /** Agent 灵魂提示词（模板字符串） */
  agentSoulPrompt: string | null
}

/** 客户端环境信息（会话级，对齐 tinker-agent ClientEnv） */
export interface ClientEnv {
  os: string
  arch?: string
  clientType: string
  shell: string
  homeDir: string
  pathFormat: string
}

/** 会话上下文构建选项（sessionId + profile + sender 由 controller 注入） */
export interface SessionContextBuildOptions {
  /** 会话 ID（首次对话可空，此时用 profile 创建会话） */
  sessionId?: string
  /** Agent 画像标识（必传：明确指定与哪个 Agent 对话） */
  profile: string
  /** 事件发送器（对齐 Java IEventSender） */
  sender: IEventSender
}

/**
 * 事件发送器接口（对齐 Java IEventSender）：
 * 每种方法对应一类语义明确的事件通道，AgentLoop 可在对话任意阶段发事件。
 */
export interface IEventSender {
  /** 消息通道（入会话消息列表） */
  sendMessage(sessionId: string, type: string, data: unknown): void
  /** 动作通道（入会话消息列表） */
  sendAction(sessionId: string, type: AgentActionType | (string & {}), data: unknown): void
  /** 提示信号通道（一次性展示） */
  sendTips(sessionId: string, type: string, message: string): void
  /** 流式 token 通道（text/reasoning/toolCallArgs 增量） */
  sendToken(sessionId: string, chunk: LlmChunk): void
  /** 审批请求通道（工具需审批时弹审批卡片，对齐 Java APPROVAL_REQUEST 事件） */
  sendApprovalRequest(sessionId: string, data: { toolCallId: string; name: string; arguments?: unknown; reason?: string }): void
}

/** 会话级上下文（对话开始前一次性加载） */
export interface SessionContext {
  sessionId: string
  profile: string
  /** YOLO 模式（自动批准工具，来自 sessions 表） */
  yolo: boolean
  /** Agent 运行参数（无配置行走默认值，对齐 Java agentConfigService.resolve） */
  agentConfig: AgentConfig
  /** Agent Mode 引用（agent 表的 agent_mode_id，对齐 Java SessionContext） */
  agentModeId: string
  /** Agent Mode 版本（agent 表的 agent_mode_version） */
  agentModeVersion: string
  /** Agent Mode 实例（注册表解析，对齐 Java getAgentMode） */
  agentMode?: IAgentMode
  /** 客户端环境 */
  clientEnv: ClientEnv
  /** 事件发送器（对齐 Java IEventSender：对话任意阶段推送事件） */
  sender: IEventSender

  // ── 事件发送快捷方法（委托 sender，对齐 Java SessionContext 直接方法） ──

  /** 发送提示（一次性弹窗/气泡） */
  sendTips(eventType: string, content: string): void
  /** 发送动作事件（入会话消息列表） */
  sendAction(eventType: AgentActionType | (string & {}), payload: Record<string, unknown> | null): void
  /** 发送消息事件（入会话消息列表） */
  sendMessage(eventType: string, payload: unknown): void
  /** 发送流式 token（text/reasoning/toolCallArgs 增量） */
  sendToken(chunk: LlmChunk): void
  /** 发送审批请求（弹审批卡片） */
  sendApprovalRequest(data: { toolCallId: string; name: string; arguments?: unknown; reason?: string }): void
}

/** 对话周期级上下文（继承 SessionContext） */
export interface ConversationContext extends SessionContext {
  conversationId: string
  /** 本周期可用工具名列表 */
  toolNames: string[]
  /** 场景 → 候选模型配置列表 */
  modelConfigs: Map<string, ModelConfig[]>

  /** 获取主对话场景的第一个模型配置 */
  getMainModelConfig(): ModelConfig | null
  /** 根据场景获取模型配置 */
  getConfigByScene(scene: string): ModelConfig | null
}

/** 工具执行级上下文（继承 ConversationContext，叠加当前工具调用） */
export interface ToolContext extends ConversationContext {
  /** 待执行的工具调用 */
  toolCall: ToolCall
}
