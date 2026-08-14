/**
 * types.ts — TinkerAgent 统一类型定义
 *
 * 只放类型定义（接口），实现集中在 tinker-agent.ts。
 * ConversationEngine 相关接口（线程模型版）。
 */
import type {LlmRouter} from '../llm/llm-router'
import type {AgentActionType} from '../constants'
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
import type {ApprovalManager} from './approval-manager'
import type {ToolCallExecutor} from './tool-call-executor'
import type {SessionRuntime} from './session-runtime'

/** 主对话场景（单一来源在 core/llm/types，此处不再重复定义） */

/** 对话状态常量（单一来源在 core/constants/conversation，此处 re-export） */
export { CONV_IN_PROGRESS, CONV_COMPLETED, CONV_COMPRESSED } from '../constants/conversation'

/** 引擎层响应类型（TinkerAgent 内部产生的非 LLM 响应） */
export const RES_INTERRUPTED = 'INTERRUPTED'

/** TinkerAgent 构造参数 */
export interface TinkerAgentOptions {
  /** 会话 id（实例化绑定——一个会话一个 TinkerAgent 实例） */
  sessionId: string
  /** 用户 profile（agent 配置归属） */
  profile: string
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
export interface TinkerAgentResult {
  response: LlmResponse
  sessionId: string
  conversationId: string
}

// ── 三级上下文 ──

/** Agent 配置 */
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
  /** 消息沟通方式（queue 排队 / redirect 重定向 / interrupt 打断）——忙碌时新消息的处置策略 */
  messageBusyMode: BusyMode
}

/** 忙碌时消息处置模式（常量单一来源——全局引用 BUSY_MODE_*） */
export const BUSY_MODE_QUEUE = 'queue'
export const BUSY_MODE_REDIRECT = 'redirect'
export const BUSY_MODE_INTERRUPT = 'interrupt'
export type BusyMode = typeof BUSY_MODE_QUEUE | typeof BUSY_MODE_REDIRECT | typeof BUSY_MODE_INTERRUPT

/** 忙碌时消息处置策略接口（queue 排队 / redirect 重定向 / interrupt 打断） */
export interface BusyModeStrategy {
  readonly mode: BusyMode

  /** 新消息到达（run 进行中）——策略决定如何处置 */
  onNewMessage(runtime: BusyStrategyHost, text: string): void

  /**
   * loop 被 abort 后的处置
   * @returns true = 继续循环（redirect 注入后重试）；false = 退出循环
   */
  onLoopInterrupted(host: BusyLoopHost): Promise<boolean>

  /** run 结束后的衔接——返回要立即处理的新消息（interrupt 用）；无则 null */
  nextTurnMessage(): string | null

  /** run 退出前的收尾（interrupt 用——flush 内存消息到 DB） */
  onRunExit?(host: BusyLoopHost): Promise<void>
}

/** 策略宿主：session-runtime 暴露给策略的最小面（注入依赖——避免循环引用） */
export interface BusyStrategyHost {
  /** 挂起重定向修正（redirect 用） */
  requestRedirect(text: string): void
  /** 挂起打断（interrupt 用——立即 abort 或等工具完成） */
  requestInterrupt(text: string): void
  /** 当前是否在工具执行中（决定 abort 时机） */
  isExecutingTools(): boolean
}

/** 策略宿主：conversation 暴露给策略的最小面（注入依赖——避免循环引用） */
export interface BusyLoopHost {
  /** 取走挂起的修正文本（redirect 用——无则 null） */
  takePendingRedirect(): string | null
  /** 注入修正并重建 abort（redirect 用——返回后继续循环） */
  applyActiveTurnRedirect(pending: string): Promise<void>
  /** 重建 AbortController（redirect 继续循环前） */
  resetAbort(): void
  /** flush 内存消息到 DB（interrupt 退出前） */
  flushPendingMessagesToDb(): Promise<void>
}

/** 客户端环境信息 */
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
  /** 事件发送器 */
  sender: IEventSender
}

/**
 * 事件发送器接口：
 * 每种方法对应一个业务域（一级路由），内部组装 route = '{一级}:{二级}'。
 * 协议见 docs/event-protocol.md。
 */
export interface IEventSender {
  /** chat 域（对话内容流：token/approval/clarify/interaction_status） */
  sendMessage(sessionId: string, type: string, data: unknown): void
  /** action 域（行为动作：tool_start/tool_done） */
  sendAction(sessionId: string, type: AgentActionType | (string & {}), data: unknown): void
  /** session 域（会话数据/状态：stats/complete/title/budget）——convId 可选（多会话并发时区分对话） */
  sendSession(sessionId: string, type: string, data: unknown, convId?: string): void
  /** tip 域（提示信号：queued/working） */
  sendTips(sessionId: string, type: string, message: string): void
  /** error 域（报错） */
  sendError(sessionId: string, type: string, message: string): void
  /** 流式 token（chat:token 便捷方法——text/reasoning/toolCallArgs 增量） */
  sendToken(sessionId: string, chunk: LlmChunk): void
  /** 审批请求（chat:approval 便捷方法——工具需审批时弹审批卡片） */
  sendApprovalRequest(sessionId: string, data: { toolCallId: string; name: string; arguments?: unknown; reason?: string; conversationId?: string }): void
}

/** 审批挂起表项 */
export interface ApprovalWaiterEntry {
  resolve: (approved: boolean) => void
  timer: NodeJS.Timeout
  convId: string
  profile: string
  sessionId: string
}

/** 工具结果挂起表项 */
export interface ToolResultWaiterEntry {
  resolve: (result: string) => void
  timer: NodeJS.Timeout
}

/** 会话级上下文（对话开始前一次性加载） */
export interface SessionContext {
  sessionId: string
  profile: string
  /** YOLO 模式（自动批准工具，来自 sessions 表） */
  yolo: boolean
  /** Agent 运行参数 */
  agentConfig: AgentConfig
  /** Agent Mode 引用 */
  agentModeId: string
  /** Agent Mode 版本（agent 表的 agent_mode_version） */
  agentModeVersion: string
  /** Agent Mode 实例 */
  agentMode?: IAgentMode
  /** 客户端环境 */
  clientEnv: ClientEnv
  /** 事件发送器 */
  sender: IEventSender

  /** 临时 system prompt 覆盖（delegate 子代理用——不走 DB 缓存） */
  ephemeralSystemPrompt?: string
  /** 子代理深度（父=0，delegate 每层 +1——超限拒绝，防无限递归） */
  delegateDepth?: number

  // ── 事件发送快捷方法 ──

  /** 发送提示（tip 域——一次性弹窗/气泡） */
  sendTips(eventType: string, content: string): void
  /** 发送动作事件（action 域——入会话消息列表） */
  sendAction(eventType: AgentActionType | (string & {}), payload: Record<string, unknown> | null): void
  /** 发送消息事件（chat 域——入会话消息列表） */
  sendMessage(eventType: string, payload: unknown): void
  /** 发送会话数据事件（session 域——面板/标题/预算） */
  sendSession(eventType: string, payload: unknown): void
  /** 发送错误（error 域） */
  sendError(eventType: string, message: string): void
  /** 发送流式 token（chat:token——text/reasoning/toolCallArgs 增量） */
  sendToken(chunk: LlmChunk): void
  /** 发送审批请求（chat:approval——弹审批卡片） */
  sendApprovalRequest(data: { toolCallId: string; name: string; arguments?: unknown; reason?: string; conversationId?: string }): void
}

/** 对话周期级上下文（继承 SessionContext） */
/**
 * 对话周期上下文（每轮构建）——不再 extends SessionContext（收敛为最小组合）：
 * 显式声明工具执行/审批/压缩/提示词构建实际需要的字段——不携带整份会话配置快照。
 */
export interface ConversationContext {
  sessionId: string
  profile: string
  /** Agent 运行参数（工具门检/压缩阈值/迭代上限） */
  agentConfig: AgentConfig
  /** 客户端环境（提示词构建：runtime-environment/soul-prompt） */
  clientEnv: ClientEnv
  /** YOLO 模式（工具门检自动批准） */
  yolo: boolean
  /** 临时 system prompt 覆盖（delegate 子代理——不走 DB 缓存） */
  ephemeralSystemPrompt?: string
  /** Agent Mode 实例（提示词构建：agent-mode 模块） */
  agentMode?: IAgentMode
  /** 子代理深度（delegate 工具——防无限递归） */
  delegateDepth?: number
  /** 事件发送器（审批/工具状态推送） */
  sender: IEventSender
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
  /** 父回合 abort 信号（delegate 等长工具中断传播用——父 abort 即通知子代理停） */
  abortSignal?: AbortSignal
}

/** 对话轮次依赖（TinkerAgent 组装传入 Conversation） */
export interface ConversationDeps {
  llmRouter: LlmRouter
  toolManager: ToolManager
  messageService: MessageService
  sessionService: SessionService
  conversationService: ConversationService
  compactionService: CompactionService
  promptModuleBuilder: PromptModuleBuilder
  modelConfigService: ModelConfigService
  sandboxWhitelistService: SandboxWhitelistService
  toolAuthService: ToolAuthService
  /** 会话级运行时（中断控制） */
  runtime: SessionRuntime
  /** 审批/工具结果管理（会话级共享——IPC 入口在 TinkerAgent 委托同一实例） */
  approvalManager: ApprovalManager
  /** 工具执行器（无状态——可每轮新建或共享） */
  toolExecutor: ToolCallExecutor
}

/** 工具执行器依赖（TinkerAgent 组装传入 ToolCallExecutor） */
export interface ToolCallExecutorDeps {
  toolManager: ToolManager
  sandboxWhitelistService: SandboxWhitelistService
  toolAuthService: ToolAuthService
  promptModuleBuilder: PromptModuleBuilder
  approvalManager: ApprovalManager
  /** 会话运行时（delegate 中断传播——父 abort 信号注入工具上下文） */
  runtime: SessionRuntime
}
