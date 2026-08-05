/**
 * context.ts — AgentLoop 三级上下文（对齐 showing-agent SessionContext → ConversationContext → ToolContext）
 *
 * 所有配置数据、环境变量在对话开始前一次性加载，贯穿整个对话周期，
 * 避免一次对话反复读取数据库加载配置。
 *
 * 层级：
 *   SessionContext（会话级）→ ConversationContext（周期级，继承）→ ToolContext（工具执行级）
 */
import type {ToolCall} from '../../defines/models/message'
import type {ModelConfig} from '../llm/types'
import {SCENE_CHAT} from './types'

/** Agent 配置（会话级，对齐 showing-agent AgentConfig） */
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
}

/** 默认 AgentConfig（未配置时兜底） */
export function defaultAgentConfig(): AgentConfig {
  return {
    maxIterations: 30,
    thresholdPercent: 0.5,
    tailRatio: 0.2,
    toolExecutionTimeout: 300,
    maxConversations: 1,
    memoryMaxChars: 20000,
    userMaxChars: 8192,
    warningsEnabled: true,
    hardStopEnabled: true,
    exactFailureWarnAfter: 3,
    sameToolFailureWarnAfter: 3,
    noProgressWarnAfter: 3,
    exactFailureBlockAfter: 6,
    sameToolFailureHaltAfter: 6,
    noProgressBlockAfter: 6,
  }
}

/** 客户端环境信息（对齐 showing-agent ClientEnv） */
export interface ClientEnv {
  os: string
  arch?: string
  clientType: string
  shell: string
  homeDir: string
  pathFormat: string
}

/** 会话级上下文（对话开始前一次性构建，贯穿整个会话） */
export interface SessionContext {
  sessionId: string
  profile: string
  connectId: string
  yolo: boolean
  /** Agent 配置（对话开始前从 DB 加载，周期内不变） */
  agentConfig: AgentConfig
  /** 客户端环境（对话开始前探测，周期内不变） */
  clientEnv: ClientEnv

  // ── 发送回调（渲染层注入） ──
  sendTips?: (eventType: string, content: string) => void
  sendError?: (code: string, message: string) => void
  sendAction?: (eventType: string, payload: Record<string, unknown> | null) => void
  sendMessage?: (eventType: string, payload: unknown) => void
  /** 流式 token 回调 */
  onToken?: (chunk: {text: string; reasoning: string; toolCallArgs: string; isFinish: boolean; finishReason?: string}) => void
  /** 工具执行进度回调 */
  onToolStart?: (toolName: string) => void
  /** 审批请求回调：工具需要审批时调用，返回 Promise<boolean> */
  onApprovalRequest?: (toolCall: ToolCall, reason?: string) => Promise<boolean>
}

/** 对话周期级上下文（继承 SessionContext，每次 startCycle 构建） */
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

/** 从 SessionContext 创建对话周期上下文 */
export function startCycle(
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

/** 工具执行级上下文（从 ConversationContext 派生） */
export interface ToolContext {
  /** 对话周期上下文 */
  session: ConversationContext
  conversationId: string
  sessionId: string
  /** 待执行的工具调用 */
  toolCall: ToolCall
  yolo: boolean
  profile: string
}

/** 从 ConversationContext 创建工具执行上下文 */
export function createToolContext(session: ConversationContext, toolCall: ToolCall): ToolContext {
  return {
    session,
    conversationId: session.conversationId,
    sessionId: session.sessionId,
    toolCall,
    yolo: session.yolo,
    profile: session.profile,
  }
}
