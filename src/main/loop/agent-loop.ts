/**
 * agent-loop.ts — 线程模型 AgentLoop（三级上下文版）
 *
 * 本地客户端用 JS 的 async/await 线程模型，状态保存在函数调用栈里。
 * 上下文管理对齐 showing-agent：SessionContext → ConversationContext → ToolContext
 * 三级继承，所有配置/环境在对话开始前一次性加载，贯穿整个周期。
 *
 * 完整链路：
 *   构建 SessionContext（配置加载）→ 会话加载/创建 → startCycle（ConversationContext）
 *   → 上下文加载（摘要+历史+暂存）→ 提示词构建（system） → LLM 流式调用
 *   → 工具执行（ToolContext）→ 结果回填 → 循环 → 完成 → 落库 → 压缩检查
 *
 * 对外事件（对齐 showing-agent IConversationEngine）：
 *   chat          — 用户消息入口（onUserMessage）
 *   onToolResult  — 工具结果回调（外部工具异步返回时挂起恢复）
 *   onApproval    — 审批响应回调（同意/拒绝）
 *   revoke        — 撤回消息
 *   interrupt     — 中断当前对话（stop）
 *   clearAll      — 清理会话状态
 */
import type { ToolCall } from '../../defines/models/message'
import type { ToolSchema } from '../../defines/tools/base-tool'
import { SCENE_SUMMARY } from '../llm/types'
import { RES_REASONING, RES_TEXT, RES_TOOL_CALLS } from '../llm/llm-response'
import type { LlmRouter } from '../llm/llm-router'
import type { ApiMessage, LlmResponse, LlmRouterContext, ModelConfig, ChunkCallback } from '../llm/types'
import type { PromptModuleBuilder } from '../prompt/prompt-module-builder'
import type { PromptContext } from '../prompt/types'
import type { CompactionService } from '../service/compaction-service'
import type { ConversationService } from '../service/conversation-service'
import type { MessageService } from '../service/message-service'
import { MessageFactory } from '../service/message-service'
import type { SessionService } from '../service/session-service'
import type { ToolManager } from '../tools/tool-manager'
import { SCENE_CHAT, CONV_COMPLETED, CONV_COMPRESSED, RES_INTERRUPTED } from './types'
import type { AgentLoopOptions, AgentLoopResult } from './types'
import type { ConversationContext, SessionContext, ToolContext } from './context'
import { startCycle, createToolContext, defaultAgentConfig } from './context'
import type { AgentConfig, ClientEnv } from './context'

/** 线程模型 AgentLoop */
export class AgentLoop {
  private readonly llmRouter: LlmRouter
  private readonly toolManager: ToolManager
  private readonly messageService: MessageService
  private readonly sessionService: SessionService
  private readonly conversationService: ConversationService
  private readonly compactionService: CompactionService
  private readonly promptModuleBuilder: PromptModuleBuilder
  private readonly resolveModelConfigs: (scene: string) => ModelConfig[]

  /** 中断标志：sessionId → abort */
  private readonly abortControllers = new Map<string, AbortController>()
  /** 审批挂起表：toolCallId → {resolve, reject} */
  private readonly approvalWaiters = new Map<string, { resolve: (approved: boolean) => void }>()
  /** 工具结果挂起表：toolCallId → {resolve} */
  private readonly toolResultWaiters = new Map<string, { resolve: (result: string) => void }>()

  constructor(options: AgentLoopOptions) {
    this.llmRouter = options.llmRouter
    this.toolManager = options.toolManager
    this.messageService = options.messageService
    this.sessionService = options.sessionService
    this.conversationService = options.conversationService
    this.compactionService = options.compactionService
    this.promptModuleBuilder = options.promptModuleBuilder
    this.resolveModelConfigs = options.resolveModelConfigs
  }

  /** LlmRouterContext（getModelConfigs 按场景返回） */
  private createRouterContext(modelConfigs: Map<string, ModelConfig[]>): LlmRouterContext {
    return {
      getModelConfigs: (scene: string) => modelConfigs.get(scene) ?? [],
    }
  }

  /** 工具 Schema 列表（转成 llm 层需要的 OpenAI function calling 格式） */
  private getToolSchemas(profile: string): ToolSchema[] {
    return this.toolManager
      .getAvailableSchemas(profile)
      .map((s) => s.toFunctionCallingFormat() as unknown as ToolSchema)
  }

  /** 构建 PromptContext（供提示词模块使用） */
  private buildPromptContext(ctx: SessionContext): PromptContext {
    const cycle = ctx as ConversationContext
    const mainModel = cycle.getMainModelConfig?.()
    return {
      sessionId: ctx.sessionId,
      profile: ctx.profile,
      toolNames: this.toolManager.getAvailableToolNames(ctx.profile),
      clientEnv: ctx.clientEnv,
      modelName: mainModel?.modelName,
    }
  }

  /**
   * 用户消息入口（onUserMessage）：单轮对话完整链路。
   * 入参最小化：sessionId?（不传自动创建）+ profile + 回调；配置在内部一次性加载。
   */
  async chat(options: {
    sessionId?: string
    profile: string
    connectId?: string
    yolo?: boolean
    onToken?: ChunkCallback
    onToolStart?: (toolName: string) => void
    onApprovalRequest?: (toolCall: ToolCall, reason?: string) => Promise<boolean>
  }, userMessage: string): Promise<AgentLoopResult> {
    const profile = options.profile

    // ── 1. 会话：存在则加载，不存在则创建 ──
    let sessionId = options.sessionId
    if (!sessionId) {
      const created = this.sessionService.create(profile)
      sessionId = created.id
    }
    // 会话 ID 此时必存在（创建或传入）
    sessionId = sessionId as string
    const sessionEntity = this.sessionService.findById(sessionId)
    if (!sessionEntity) {
      throw new Error(`会话不存在: ${sessionId}`)
    }

    // ── 2. 构建 SessionContext（配置一次性加载：AgentConfig + clientEnv） ──
    const sessionCtx: SessionContext = {
      sessionId,
      profile,
      connectId: options.connectId ?? 'local',
      yolo: options.yolo ?? false,
      agentConfig: this.loadAgentConfig(profile),
      clientEnv: this.loadClientEnv(),
      onToken: options.onToken,
      onToolStart: options.onToolStart,
      onApprovalRequest: options.onApprovalRequest,
    }

    // 注册中断控制
    const abort = new AbortController()
    this.abortControllers.set(sessionId, abort)

    // ── 3. 对话周期：创建 IN_PROGRESS 对话 + 构建 ConversationContext ──
    const conv = this.conversationService.startConversation(sessionId)
    const convId = conv.id
    const toolNames = this.toolManager.getAvailableToolNames(profile)
    const allConfigs = this.resolveAllConfigs(profile)
    const cycle = startCycle(sessionCtx, convId, toolNames, allConfigs)

    // ── 4. 用户消息入暂存 ──
    this.messageService.saveTempMessage(MessageFactory.buildUserMessage(convId, sessionId, profile, userMessage))

    // ── 5. 上下文加载（摘要 + 历史 + 暂存）→ 转 ApiMessage ──
    const history = this.messageService.loadContextMessages(sessionId, convId, profile)

    // ── 6. 提示词构建（system 消息） ──
    const systemPrompt = this.promptModuleBuilder.buildSystemPrompt(this.buildPromptContext(cycle))
    const messages: ApiMessage[] = []
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    messages.push(...history)

    const ctx = this.createRouterContext(allConfigs)
    const tools = this.getToolSchemas(profile)

    try {
      // ── 7. while-loop：LLM 调用 ↔ 工具执行 ──
      while (!abort.signal.aborted) {
        const response = await this.llmRouter.chat(SCENE_CHAT, ctx, messages, tools, cycle.onToken ?? (() => { }))

        switch (response.resType) {
          case RES_TEXT:
            // 完成：助手消息持久化 + 返回
            this.messageService.saveTempMessage(MessageFactory.buildAssistantText(convId, sessionId, profile, response.text))
            // 主动压缩检查（阈值 + 冷却控制）
            await this.checkCompaction(cycle, response)
            return this.finishCycle(cycle, response)

          case RES_TOOL_CALLS:
            // 工具调用：保存工具调用消息 + 逐个执行 + 结果回填
            this.messageService.saveTempMessage(
              MessageFactory.buildAssistantToolCall(
                convId,
                sessionId,
                profile,
                response.reasoningContent ?? '',
                Object.fromEntries(response.toolCalls.map((tc) => [tc.id, { name: tc.name, arguments: tc.arguments }]))
              )
            )
            for (const tc of response.toolCalls) {
              cycle.onToolStart?.(tc.name)
              const result = await this.executeToolCall(cycle, tc)
              // 工具结果持久化 + 回填 LLM 上下文
              this.messageService.saveTempMessage(MessageFactory.buildToolResult(convId, sessionId, profile, tc.id, result))
              messages.push({
                role: 'tool',
                content: result,
                toolCallId: tc.id,
                name: tc.name,
              })
            }
            // 继续 while(true) → 下一轮 LLM 调用
            break

          case RES_REASONING:
            // 纯推理（thinking prefilling）→ 保存推理内容，继续
            this.messageService.saveTempMessage(MessageFactory.buildAssistantThinking(convId, sessionId, profile, response.reasoningContent ?? ''))
            break

          default:
            // 错误/空响应 → 结束周期返回
            return this.finishCycle(cycle, response)
        }
      }

      // 中断触发
      return this.finishCycle(cycle, {
        resType: RES_INTERRUPTED,
        text: '',
        toolCalls: [],
        errorMessage: '对话已被用户中断',
      } as LlmResponse)
    } finally {
      this.abortControllers.delete(sessionId)
    }
  }

  /**
   * 工具结果回调（onToolResult）：外部工具异步返回时挂起恢复。
   * 线程模型本地工具同步执行不经过此方法；UI/扩展工具通过 IPC 回调时调用。
   */
  onToolResult(sessionId: string, toolCallId: string, result: string): boolean {
    const waiter = this.toolResultWaiters.get(toolCallId)
    if (!waiter) {
      console.warn(`工具结果回调无挂起等待者：toolCallId=${toolCallId}`)
      return false
    }
    this.toolResultWaiters.delete(toolCallId)
    waiter.resolve(result)
    console.log(`action=TOOL_RESULT sessionId=${sessionId} toolCallId=${toolCallId} resultLen=${result.length}`)
    return true
  }

  /**
   * 审批响应回调（onApprovalResponse）：用户同意/拒绝工具执行。
   * 线程模型通过 onApprovalRequest 回调询问，用户答复后 resolve 挂起的 Promise。
   */
  onApproval(sessionId: string, toolCallId: string, approved: boolean): boolean {
    const waiter = this.approvalWaiters.get(toolCallId)
    if (!waiter) {
      console.warn(`审批响应无挂起等待者：toolCallId=${toolCallId}`)
      return false
    }
    this.approvalWaiters.delete(toolCallId)
    waiter.resolve(approved)
    console.log(`action=APPROVAL sessionId=${sessionId} toolCallId=${toolCallId} approved=${approved}`)
    return true
  }

  /**
   * 撤回消息（onRevoke）：线程模型串行执行中，仅能撤销尚未处理的入队消息。
   * 当前线程模型单会话串行，chat() 已在处理中的消息无法撤回；
   * 预留接口，返回 false 表示无法撤销。
   */
  revoke(sessionId: string, _messageId: string): boolean {
    // 线程模型无消息队列（状态在调用栈），正在处理的对话不可撤销
    console.warn(`线程模型不支持撤回：sessionId=${sessionId}`)
    return false
  }

  /**
   * 中断当前对话（onInterrupt / stop）：通过 AbortController 终止 while-loop。
   */
  interrupt(sessionId: string): boolean {
    const abort = this.abortControllers.get(sessionId)
    if (!abort) {
      console.warn(`中断失败：会话 ${sessionId} 无进行中的对话`)
      return false
    }
    abort.abort()
    console.log(`action=INTERRUPT sessionId=${sessionId}`)
    return true
  }

  /** 清理会话状态（clearAll）：取消中断控制 + 清理挂起表 */
  clearAll(sessionId: string): void {
    const abort = this.abortControllers.get(sessionId)
    if (abort) {
      abort.abort()
      this.abortControllers.delete(sessionId)
    }
    // 清理该会话相关的挂起表项
    for (const [toolCallId, waiter] of this.approvalWaiters) {
      if (toolCallId.startsWith(sessionId)) {
        waiter.resolve(false)
        this.approvalWaiters.delete(toolCallId)
      }
    }
    for (const [toolCallId, waiter] of this.toolResultWaiters) {
      if (toolCallId.startsWith(sessionId)) {
        waiter.resolve('')
        this.toolResultWaiters.delete(toolCallId)
      }
    }
    console.log(`action=CLEAR-ALL sessionId=${sessionId}`)
  }

  // ══════════════════════════════════════════════════════════════
  // 内部方法
  // ══════════════════════════════════════════════════════════════

  /** 加载 Agent 配置（对话开始前一次性加载，避免周期内反复读 DB） */
  private loadAgentConfig(profile: string): AgentConfig {
    // TODO: 从 agent_configs 表读取（AgentConfigRepository），未配置时用默认值
    return defaultAgentConfig()
  }

  /** 加载客户端环境（对话开始前探测，周期内不变） */
  private loadClientEnv(): ClientEnv {
    return {
      os: process.platform,
      clientType: 'desktop',
      shell: 'bash',
      homeDir: process.env.HOME ?? '',
      pathFormat: 'unix',
    }
  }

  /** 解析全部场景的模型配置（对话开始前一次性加载） */
  private resolveAllConfigs(profile: string): Map<string, ModelConfig[]> {
    const map = new Map<string, ModelConfig[]>()
    map.set(SCENE_CHAT, this.resolveModelConfigs(SCENE_CHAT))
    map.set(SCENE_SUMMARY, this.resolveModelConfigs(SCENE_SUMMARY))
    return map
  }

  /** 主动压缩检查：LLM 调用接近上下文上限时触发压缩（阈值 + 冷却控制） */
  private async checkCompaction(cycle: ConversationContext, response: LlmResponse): Promise<void> {
    try {
      const mainConfig = cycle.getMainModelConfig()
      if (!mainConfig || response.promptTokens === undefined) {
        return
      }
      const threshold = cycle.agentConfig.thresholdPercent
      if (this.compactionService.shouldCompact(cycle.sessionId, cycle.profile, mainConfig, threshold, response.promptTokens)) {
        const compressConfig = cycle.getConfigByScene(SCENE_SUMMARY) ?? mainConfig
        await this.compactionService.compact(cycle.sessionId, cycle.profile, mainConfig.contextLimit, cycle.agentConfig.tailRatio, compressConfig)
      }
    } catch (e) {
      console.warn(`主动压缩检查异常（不影响主流程）: ${(e as Error).message}`)
    }
  }

  /** 周期结束：对话标记完成 + 消息落库 + token 统计 */
  private finishCycle(cycle: ConversationContext, response: LlmResponse): AgentLoopResult {
    const { sessionId, conversationId: convId, profile } = cycle
    // 对话完成
    this.conversationService.updateStatus(convId, sessionId, CONV_COMPLETED)
    // 暂存消息落库
    this.messageService.flushConversation(convId)
    // 会话 token 统计
    if (response.promptTokens !== undefined || response.completionTokens !== undefined) {
      this.sessionService.accumulateTokens(
        sessionId,
        response.promptTokens ?? 0,
        response.completionTokens ?? 0,
        response.cacheReadTokens ?? 0,
        response.cacheWriteTokens ?? 0
      )
    }
    return { response, sessionId, conversationId: convId }
  }

  /** 执行单个工具调用（本地直接 await；需要审批时挂起等待） */
  private async executeToolCall(cycle: ConversationContext, toolCall: ToolCall): Promise<string> {
    const toolCtx = createToolContext(cycle, toolCall)

    // ── 审批检查：需要审批（非 yolo 且配置了审批回调）时挂起 ──
    if (!toolCtx.yolo && cycle.onApprovalRequest) {
      const approved = await this.requestApproval(cycle, toolCall)
      if (!approved) {
        return '用户拒绝执行'
      }
    }

    const result = await this.toolManager.execute(this.toToolExecContext(toolCtx))
    if (result.async) {
      // 异步工具：挂起等待外部回调（UI 工具等通过 onToolResult 恢复）
      return this.waitToolResult(toolCall.id)
    }
    return result.result
  }

  /** ToolContext → 工具执行上下文（tools 层格式） */
  private toToolExecContext(ctx: ToolContext): import('../tools/types').ToolExecutionContext {
    return {
      sessionId: ctx.sessionId,
      conversationId: ctx.conversationId,
      profile: ctx.profile,
      connectId: ctx.session.connectId,
      yolo: ctx.yolo,
      toolCall: ctx.toolCall,
      sendAction: (_eventType, _payload) => {
        // 本地执行，无客户端派发
      },
      sendMessage: (_eventType, _payload) => {
        // 本地执行，无客户端派发
      },
    }
  }

  /** 审批请求：注册挂起等待 → 调 onApprovalRequest 回调 → 等 onApproval 恢复 */
  private requestApproval(cycle: ConversationContext, toolCall: ToolCall): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.approvalWaiters.set(toolCall.id, { resolve })
      // 通知 UI 弹审批卡片
      const approvedPromise = cycle.onApprovalRequest?.(toolCall)
      if (approvedPromise === undefined) {
        // 未配置审批回调 → 默认允许
        this.approvalWaiters.delete(toolCall.id)
        resolve(true)
      } else if (approvedPromise instanceof Promise) {
        // 回调直接返回 Promise（如 IPC await 用户答复）
        approvedPromise.then((approved) => {
          this.approvalWaiters.delete(toolCall.id)
          resolve(approved)
        })
      }
    })
  }

  /** 等待外部工具结果（挂起，直到 onToolResult 恢复） */
  private waitToolResult(toolCallId: string): Promise<string> {
    return new Promise<string>((resolve) => {
      this.toolResultWaiters.set(toolCallId, { resolve })
    })
  }
}
