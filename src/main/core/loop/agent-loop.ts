/**
 * agent-loop.ts — 线程模型 AgentLoop（三级上下文版）
 *
 * 本地客户端用 JS 的 async/await 线程模型，状态保存在函数调用栈里。
 * 上下文管理对齐 tinker-agent：SessionContext → ConversationContext → ToolContext
 * 三级继承，所有配置/环境在对话开始前一次性加载，贯穿整个周期。
 *
 * 完整链路：
 *   构建 SessionContext（配置加载）→ 会话加载/创建 → startCycle（ConversationContext）
 *   → 上下文加载（摘要+历史+暂存）→ 提示词构建（system） → LLM 流式调用
 *   → 工具执行（ToolContext）→ 结果回填 → 循环 → 完成 → 落库 → 压缩检查
 *
 * 对外事件（对齐 tinker-agent IConversationEngine）：
 *   chat          — 用户消息入口（onUserMessage）
 *   onToolResult  — 工具结果回调（外部工具异步返回时挂起恢复）
 *   onApproval    — 审批响应回调（同意/拒绝）
 *   revoke        — 撤回消息
 *   interrupt     — 中断当前对话（stop）
 *   clearAll      — 清理会话状态
 */
import type { CompactionService } from '../../service/compaction-service'
import type { ConversationService } from '../../service/conversation-service'
import { MessageQueueStore } from '../../service/message-queue-store'
import type { MessageService } from '../../service/message-service'
import { MessageFactory } from '../../service/message-service'
import type { ModelConfigService } from '../../service/model-config-service'
import type { SandboxWhitelistService } from '../../service/sandbox-whitelist-service'
import { SandboxDecision } from '../../service/sandbox-whitelist-service'
import type { SessionService } from '../../service/session-service'
import type { ToolAuthService } from '../../service/tool-auth-service'
import { AuthzDecision } from '../../service/tool-auth-service'
import { GuardrailAction, ToolLoopGuardrail, appendGuardrailGuidance, classifyToolFailure, syntheticGuardrailResult } from '../../service/tool-loop-guardrail-service'
import { ERROR_CONTEXT_OVERFLOW, RES_EMPTY, RES_REASONING, RES_TEXT, RES_TOOL_CALLS, RES_TRUNCATED } from '../llm/llm-response'
import type { LlmRouter } from '../llm/llm-router'
import type { ApiMessage, LlmChunk, LlmResponse, LlmRouterOptions, ModelConfig, ToolCall } from '../llm/types'
import { SCENE_SUMMARY, SCENE_TITLE } from '../llm/types'
import type { PromptModuleBuilder } from '../prompt/prompt-module-builder'
import type { ToolManager } from '../tool/tool-manager'
import type { ToolSchema } from '../tool/tool-schema'
import type { ConversationContext, SessionContext } from './context'
import { AgentActionType } from './constants'
import { buildConvCtx, buildToolCtx } from './context'
import type { AgentLoopOptions, AgentLoopResult } from './types'
import { CONV_COMPLETED, RES_INTERRUPTED } from './types'
import { SCENE_CHAT } from '../llm/types'
import {
  APPROVAL_REJECTED_MSG,
  EVT_BUDGET_UPDATE,
  EVT_INTERACTION_STATUS_UPDATE,
  EVT_MESSAGE_QUEUED,
  EVT_SESSION_TITLE_UPDATED,
  EVT_TOOL_DONE,
  EVT_TOOL_START,
  ROLE_SYSTEM,
  ROLE_TOOL,
  ROLE_ASSISTANT,
  STATUS_TIMED_OUT,
} from './constants'
import { MSG_TYPE_APPROVAL_REQUEST, MSG_TYPE_TOOL_RESULT } from '../../service/message-service'

/** 线程模型 AgentLoop */
export class AgentLoop {
  /** 审批超时（ms）：用户未响应视为拒绝（对齐 Java 审批过期） */
  private static readonly APPROVAL_TIMEOUT_MS = 60_000
  /** 澄清/工具结果超时（ms）：客户端未返回视为过期（对齐 Java STATUS_TIMED_OUT） */
  private static readonly CLARIFY_TIMEOUT_MS = 60_000
  /** 会改变 prompt 缓存内容的工具（对齐 Java CACHE_AFFECTING_TOOLS：skill_manage/memory → skills-index/memory-snapshot/user-profile） */
  private static readonly CACHE_AFFECTING_TOOLS = new Set([
    'builtin_tinker_skill_manage',
    'builtin_tinker_memory',
  ])
  private readonly llmRouter: LlmRouter
  private readonly toolManager: ToolManager
  private readonly messageService: MessageService
  private readonly sessionService: SessionService
  private readonly conversationService: ConversationService
  private readonly compactionService: CompactionService
  private readonly promptModuleBuilder: PromptModuleBuilder
  private readonly modelConfigService: ModelConfigService
  /** 用户消息队列（per-session 串行处理） */
  private readonly queueStore = new MessageQueueStore()
  /** 沙盒白名单服务（工具门检） */
  private readonly sandboxWhitelistService: SandboxWhitelistService
  /** 工具授权服务（工具门检） */
  private readonly toolAuthService: ToolAuthService

  /** 中断标志：sessionId → abort */
  private readonly abortControllers = new Map<string, AbortController>()
  /** 审批挂起表：toolCallId → {resolve, timer}（超时自动拒绝） */
  private readonly approvalWaiters = new Map<string, { resolve: (approved: boolean) => void; timer: NodeJS.Timeout }>()
  /** 工具结果挂起表：toolCallId → {resolve, timer}（超时返回超时结果） */
  private readonly toolResultWaiters = new Map<string, { resolve: (result: string) => void; timer: NodeJS.Timeout }>()

  constructor(options: AgentLoopOptions) {
    this.llmRouter = options.llmRouter
    this.toolManager = options.toolManager
    this.messageService = options.messageService
    this.sessionService = options.sessionService
    this.conversationService = options.conversationService
    this.compactionService = options.compactionService
    this.promptModuleBuilder = options.promptModuleBuilder
    this.modelConfigService = options.modelConfigService
    this.sandboxWhitelistService = options.sandboxWhitelistService
    this.toolAuthService = options.toolAuthService
  }

  /** LlmRouterOptions 由 processCycle 内联构造 */

  /**
   * 用户消息入口（onUserMessage）：消息入队 + 串行处理。
   *
   * 对齐 Java ConversationEngine.onUserMessage(ctx, content)：
   * SessionContext 由外部（controller 经 SessionContextFactory）在对话启动前构建，
   * 装载全部配置（AgentConfig + ClientEnv + YOLO + 回调），此处只消费。
   * - 消息先入队（per-session）
   * - 会话处理中 → 排队等待（发 MESSAGE_QUEUED 提示）
   * - 空闲 → 启动处理循环
   */
  async chat(ctx: SessionContext, userMessage: string): Promise<AgentLoopResult> {
    const sessionId = ctx.sessionId

    // ── 1. 消息入队 ──
    this.queueStore.enqueueMessage(sessionId, userMessage, ctx.profile)

    // ── 2. 会话处理中 → 排队等待（处理循环结束时会自动取下一批） ──
    if (this.queueStore.isProcessing(sessionId)) {
      ctx.sendTips(EVT_MESSAGE_QUEUED, '消息已入队，等待处理…')
      return {
        response: { resType: RES_INTERRUPTED, text: '', toolCalls: [], errorMessage: '消息已入队' } as LlmResponse,
        sessionId,
        conversationId: '',
      }
    }

    // ── 3. 空闲 → 启动处理循环（串行取队列消息，一轮轮处理） ──
    return this.processLoop(ctx)
  }

  /**
   * 处理循环（对齐 Java ConversationEngine.process）：
   * 设 processing 锁 → while：预算取数 → 合并消息 → 一轮对话 → 队列空退出。
   */
  private async processLoop(ctx: SessionContext): Promise<AgentLoopResult> {
    const sessionId = ctx.sessionId
    this.queueStore.setProcessing(sessionId, true)
    let lastResult: AgentLoopResult | null = null
    try {
      while (true) {
        // 中断检查：清队退出
        const abort = this.abortControllers.get(sessionId)
        if (abort?.signal.aborted) {
          this.queueStore.clearQueue(sessionId)
          break
        }

        // 队列空 → 退出
        const allItems = this.queueStore.peekAll(sessionId)
        if (allItems.length === 0) {
          break
        }

        // 预算驱动取数（对齐 Java：~4000 token 预算，至少 1 条）
        const budgetTokens = 4000
        let takeCount = 0
        let estimated = 0
        for (const item of allItems) {
          const tokens = Math.ceil(item.content.length / 1.5)
          if (takeCount > 0 && estimated + tokens > budgetTokens) break
          estimated += tokens
          takeCount++
        }
        if (takeCount === 0) takeCount = 1

        const items = takeCount >= allItems.length
          ? this.queueStore.dequeueAll(sessionId)
          : this.queueStore.dequeueBatch(sessionId, takeCount)

        // 合并多条消息（\n 连接）→ 一轮对话
        const combined = items.map((i) => i.content).join('\n')
        lastResult = await this.processCycle(ctx, combined)
      }
      return lastResult ?? {
        response: { resType: RES_INTERRUPTED, text: '', toolCalls: [], errorMessage: '无消息处理' } as LlmResponse,
        sessionId,
        conversationId: '',
      }
    } finally {
      this.queueStore.setProcessing(sessionId, false)
    }
  }

  /**
   * 单轮对话完整链路：
   * 基于已装载的 SessionContext → 对话周期 → LLM 循环 → 工具执行 → 完成。
   */
  private async processCycle(ctx: SessionContext, userMessage: string): Promise<AgentLoopResult> {
    const { sessionId, profile } = ctx

    // 注册中断控制
    const abort = new AbortController()
    this.abortControllers.set(sessionId, abort)

    // ── 3. 对话周期：创建 IN_PROGRESS 对话 + 构建 ConversationContext ──
    const conv = this.conversationService.startConversation(sessionId)
    const convId = conv.id
    const toolNames = this.toolManager.getAvailableToolNames(profile)
    const allConfigs = this.resolveAllConfigs(profile)
    const convCtx = buildConvCtx(ctx, convId, toolNames, allConfigs)

    // ── 4. 用户消息入暂存 ──
    this.messageService.saveTempMessage(MessageFactory.buildUserMessage(convId, sessionId, profile, userMessage))

    // ── 5. 上下文加载（摘要 + 历史 + 暂存）→ 转 ApiMessage ──
    const history = this.messageService.loadContextMessages(sessionId, convId, profile)

    // ── 6. 提示词构建（system 消息） ──
    const systemPrompt = this.promptModuleBuilder.buildSystemPrompt(convCtx)
    const messages: ApiMessage[] = []
    if (systemPrompt) {
      messages.push({ role: ROLE_SYSTEM, content: systemPrompt })
    }
    messages.push(...history)

    const tools = this.toolManager
      .getAvailableSchemas(profile)
      .map((s) => s.toFunctionCallingFormat() as unknown as ToolSchema)
    const routerOpt: LlmRouterOptions = {
      scene: SCENE_CHAT,
      messages,
      tools,
      modelConfigs: allConfigs.get(SCENE_CHAT) ?? [],
    }

    try {
      // ── 7. while-loop：LLM 调用 ↔ 工具执行 ──
      // 迭代计数（对齐 Java executeLlmStep：超过 maxIterations 中断并发错误）
      let iteration = 0
      const maxIter = convCtx.agentConfig.maxIterations
      // 空响应重试计数（对齐 Java dispatchEmpty：连续空响应保护）
      let emptyRetry = 0
      // 工具循环防护（per-conversation：失败/无进展检测）
      const guardrail = new ToolLoopGuardrail(convCtx.agentConfig)

      while (!abort.signal.aborted) {
        iteration++
        if (maxIter > 0 && iteration > maxIter) {
          console.warn(`达到最大迭代次数 ${maxIter} sessionId=${sessionId} convId=${convId}`)
          this.messageService.saveTempMessage(MessageFactory.buildAssistantText(convId, sessionId, profile, '对话已达到最大迭代次数，已被中断'))
          return this.finishCycle(convCtx, {
            resType: RES_INTERRUPTED,
            text: '',
            toolCalls: [],
            errorMessage: `对话已达到最大迭代次数 ${maxIter}，已被中断`,
          } as LlmResponse)
        }

        const response = await this.llmRouter.chat(routerOpt, (chunk: LlmChunk) => convCtx.sendToken(chunk))

        // ── 剩余 token 预算（对齐 Java executeLlmStep：contextLimit × 0.85 - promptTokens）──
        const mainCfg = convCtx.getMainModelConfig()
        if (response.promptTokens !== undefined && mainCfg) {
          const budget = Math.max(Math.floor(mainCfg.contextLimit * 0.85) - response.promptTokens, 0)
          convCtx.sendAction(EVT_BUDGET_UPDATE, { remainingTokens: budget, contextLimit: mainCfg.contextLimit })
        }

        switch (response.resType) {
          case RES_TEXT:
            // 完成：助手消息持久化 + 返回
            this.messageService.saveTempMessage(MessageFactory.buildAssistantText(convId, sessionId, profile, response.text))
            // 主动压缩检查（阈值 + 冷却控制）
            await this.checkCompaction(convCtx, response)
            return this.finishCycle(convCtx, response)

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
            // 工具轮次开始：重置防护计数（对齐 Java guardrail.resetForTurn）
            guardrail.resetForTurn()
            // 回填 LLM 上下文：assistant tool_calls 消息（tool 结果消息的前置，缺失会导致 API 400）
            messages.push({
              role: ROLE_ASSISTANT,
              content: response.reasoningContent ?? '',
              toolCall: JSON.stringify(response.toolCalls.map((tc) => ({ id: tc.id, name: tc.name, arguments: tc.arguments }))),
            })
            for (const tc of response.toolCalls) {
              // 工具开始事件（对齐 Java sendAction(TOOL_START)）
              convCtx.sendAction(EVT_TOOL_START, { toolName: tc.name })
              const result = await this.executeToolCall(convCtx, tc, guardrail)
              // 工具完成事件（对齐 Java sendAction(TOOL_DONE)：前端据此隐藏 loading）
              convCtx.sendAction(EVT_TOOL_DONE, { toolCallId: tc.id, toolName: tc.name, success: true })
              // 工具结果持久化 + 回填 LLM 上下文
              this.messageService.saveTempMessage(MessageFactory.buildToolResult(convId, sessionId, profile, tc.id, result))
              messages.push({
                role: ROLE_TOOL,
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

          case RES_TRUNCATED:
            // 响应被截断：保存已产出内容 + 注入 continue 提示（对齐 Java dispatchTruncated）
            if (response.reasoningContent) {
              this.messageService.saveTempMessage(MessageFactory.buildAssistantThinking(convId, sessionId, profile, response.reasoningContent))
            }
            if (response.text) {
              this.messageService.saveTempMessage(MessageFactory.buildAssistantText(convId, sessionId, profile, response.text))
            }
            this.messageService.saveTempMessage(MessageFactory.buildUserMessage(convId, sessionId, profile, 'Your response was truncated due to token limits. Please continue from where you left off, do not repeat what has already been written.'))
            break

          case RES_EMPTY:
            // 空响应：注入继续提示（对齐 Java dispatchEmpty，带重试保护）
            emptyRetry++
            if (emptyRetry >= 3) {
              console.warn(`连续 ${emptyRetry} 次空响应，结束对话 sessionId=${sessionId}`)
              return this.finishCycle(convCtx, {
                resType: RES_INTERRUPTED,
                text: '',
                toolCalls: [],
                errorMessage: '模型连续返回空响应',
              } as LlmResponse)
            }
            const hasToolResults = messages.some((m) => m.role === ROLE_TOOL)
            this.messageService.saveTempMessage(MessageFactory.buildUserMessage(
              convId,
              sessionId,
              profile,
              hasToolResults ? '您刚执行了工具调用但未返回有效响应，请根据上面的工具结果继续处理任务。' : '请继续回答用户的问题。'
            ))
            break

          case ERROR_CONTEXT_OVERFLOW:
            // 上下文溢出：触发压缩 → 成功则继续（对齐 Java dispatchOverflow）
            const compacted = await this.handleOverflow(convCtx)
            if (compacted) {
              break
            }
            return this.finishCycle(convCtx, response)

          default:
            // 其它错误/异常响应 → 结束周期返回
            return this.finishCycle(convCtx, response)
        }
      }

      // 中断触发
      return this.finishCycle(convCtx, {
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
    clearTimeout(waiter.timer)
    waiter.resolve(result)
    console.log(`action=TOOL_RESULT sessionId=${sessionId} toolCallId=${toolCallId} resultLen=${result.length}`)
    return true
  }

  /**
   * 审批响应回调（onApprovalResponse）：用户同意/拒绝工具执行。
   * 对齐 Java onApprovalResponse：sender 发审批事件 → 用户答复 → 按 toolCallId 恢复挂起的 Promise。
   */
  onApproval(sessionId: string, toolCallId: string, approved: boolean): boolean {
    const waiter = this.approvalWaiters.get(toolCallId)
    if (!waiter) {
      console.warn(`审批响应无挂起等待者：toolCallId=${toolCallId}`)
      return false
    }
    this.approvalWaiters.delete(toolCallId)
    clearTimeout(waiter.timer)
    waiter.resolve(approved)
    console.log(`action=APPROVAL sessionId=${sessionId} toolCallId=${toolCallId} approved=${approved}`)
    return true
  }

  /**
   * 撤回消息（onRevoke）：从消息队列移除尚未处理的消息。
   * 已入队未处理的消息可撤回；处理中的对话无法撤回 → 自动中断（对齐 Java onRevoke）。
   */
  revoke(sessionId: string, messageId: string): boolean {
    // 从队列移除（仅能撤回尚未处理的入队消息）
    const removed = this.queueStore.removeFromQueue(sessionId, messageId)
    if (removed) {
      console.log(`action=REVOKE sessionId=${sessionId} messageId=${messageId}（已从队列移除）`)
      return true
    }
    console.warn(`撤回失败：消息不在队列中，自动中断 sessionId=${sessionId} messageId=${messageId}`)
    // 对齐 Java onRevoke：撤回失败 → 触发中断（消息可能已被处理）
    this.interrupt(sessionId)
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
        clearTimeout(waiter.timer)
        waiter.resolve(false)
        this.approvalWaiters.delete(toolCallId)
      }
    }
    for (const [toolCallId, waiter] of this.toolResultWaiters) {
      if (toolCallId.startsWith(sessionId)) {
        clearTimeout(waiter.timer)
        waiter.resolve('')
        this.toolResultWaiters.delete(toolCallId)
      }
    }
    console.log(`action=CLEAR-ALL sessionId=${sessionId}`)
  }

  // ══════════════════════════════════════════════════════════════
  // 内部方法
  // ══════════════════════════════════════════════════════════════

  /** 解析全部场景的模型配置（对话开始前一次性加载） */
  private resolveAllConfigs(profile: string): Map<string, ModelConfig[]> {
    const map = new Map<string, ModelConfig[]>()
    const all = this.modelConfigService.resolveAll(profile)
    // 全部场景共用同一份模型配置（本地单用户：custom_models 全量解析）
    map.set(SCENE_CHAT, all)
    map.set(SCENE_SUMMARY, all)
    map.set(SCENE_TITLE, all)
    return map
  }

  /** 主动压缩检查：LLM 调用接近上下文上限时触发压缩（阈值 + 冷却控制） */
  private async checkCompaction(convCtx: ConversationContext, response: LlmResponse): Promise<void> {
    try {
      const mainConfig = convCtx.getMainModelConfig()
      if (!mainConfig || response.promptTokens === undefined) {
        return
      }
      const threshold = convCtx.agentConfig.thresholdPercent
      if (this.compactionService.shouldCompact(convCtx.sessionId, convCtx.profile, mainConfig, threshold, response.promptTokens)) {
        const compressConfig = convCtx.getConfigByScene(SCENE_SUMMARY) ?? mainConfig
        await this.compactionService.compact(convCtx.sessionId, convCtx.profile, mainConfig.contextLimit, convCtx.agentConfig.tailRatio, compressConfig)
      }
    } catch (e) {
      console.warn(`主动压缩检查异常（不影响主流程）: ${(e as Error).message}`)
    }
  }

  /** 上下文溢出处理：触发压缩 → 成功返回 true（继续循环），失败返回 false（结束） */
  private async handleOverflow(convCtx: ConversationContext): Promise<boolean> {
    try {
      console.warn(`上下文溢出，触发压缩 sessionId=${convCtx.sessionId} convId=${convCtx.conversationId}`)
      const mainConfig = convCtx.getMainModelConfig()
      if (mainConfig) {
        const compressConfig = convCtx.getConfigByScene(SCENE_SUMMARY) ?? mainConfig
        const success = await this.compactionService.compact(
          convCtx.sessionId,
          convCtx.profile,
          mainConfig.contextLimit,
          convCtx.agentConfig.tailRatio,
          compressConfig
        )
        if (success) {
          // 压缩成功：清空当前轮次内存消息，下次循环重新加载（压缩后的历史）
          return true
        }
      }
    } catch (e) {
      console.warn(`溢出压缩异常: ${(e as Error).message}`)
    }
    console.error(`无可压缩内容，上下文溢出无法恢复 sessionId=${convCtx.sessionId}`)
    return false
  }

  /** 周期结束：对话标记完成 + 消息落库 + token 统计 */
  private finishCycle(convCtx: ConversationContext, response: LlmResponse): AgentLoopResult {
    const { sessionId, conversationId: convId, profile } = convCtx
    // 对话完成
    this.conversationService.updateStatus(convId, sessionId, CONV_COMPLETED)
    // 暂存消息落库
    this.messageService.flushConversation(convId)
    // 会话 token 统计
    if (response.promptTokens !== undefined || response.completionTokens !== undefined) {
      this.sessionService.accumulateTokens(
        sessionId,
        profile,
        response.promptTokens ?? 0,
        response.completionTokens ?? 0,
        response.cacheReadTokens ?? 0,
        response.cacheWriteTokens ?? 0
      )
    }
    // 标题生成（异步，失败不影响主流程；对齐 Java generateTitleAsync）
    void this.generateTitleAsync(convCtx)
    return { response, sessionId, conversationId: convId }
  }

  /**
   * 对话标题生成（异步，非阻塞）：
   * 提取对话历史 → TitleOperation（title_generation 场景）→ 更新会话标题 → 发事件。
   * 对齐 Java generateTitleAsync。
   */
  private async generateTitleAsync(convCtx: ConversationContext): Promise<void> {
    const { sessionId, conversationId: convId, profile } = convCtx
    try {
      const history = this.messageService.loadContextMessages(sessionId, convId, profile)
      const allConfigs = this.resolveAllConfigs(profile)
      const routerCtx: LlmRouterOptions = {
        scene: SCENE_TITLE,
        messages: history,
        tools: [],
        modelConfigs: allConfigs.get(SCENE_TITLE) ?? [],
      }
      const response = await this.llmRouter.execute(routerCtx)
      const title = response.text?.trim().slice(0, 50)
      if (title) {
        this.sessionService.updateTitle(sessionId, title, profile)
        convCtx.sendAction(EVT_SESSION_TITLE_UPDATED, { title })
        console.log(`action=TITLE_GENERATED sessionId=${sessionId} title=${title}`)
      }
    } catch (e) {
      console.warn(`标题生成失败 sessionId=${sessionId}: ${(e as Error).message}`)
    }
  }

  /** 执行单个工具调用（guardrail 门检 + 三层安全检查 + 审批 + 本地执行） */
  private async executeToolCall(convCtx: ConversationContext, toolCall: ToolCall, guardrail: ToolLoopGuardrail): Promise<string> {
    const toolCtx = buildToolCtx(convCtx, toolCall)
    const args = (toolCall.arguments ?? {}) as Record<string, unknown>

    // ── 工具循环防护：执行前检查（block/halt 时不执行，返回合成结果）──
    const before = guardrail.beforeCall(toolCall.name, args)
    if (before.action === GuardrailAction.BLOCK || before.action === GuardrailAction.HALT) {
      console.warn(`工具循环防护拦截 tool=${toolCall.name} code=${before.code} count=${before.count}`)
      return syntheticGuardrailResult(before)
    }

    // ── 三层门检（对齐 Java checkToolGate）：授权 → 沙盒 ──
    // ① YOLO 模式跳过所有安全检查
    if (!toolCtx.yolo) {
      // ② 授权检查（危险参数模式 → ASK）
      const authz = this.toolAuthService.check(toolCall.name, args)
      if (authz === AuthzDecision.ASK) {
        const approved = await this.requestApproval(convCtx, toolCall, '危险操作，需要审批')
        if (!approved) {
          return APPROVAL_REJECTED_MSG
        }
      }
      // ③ 沙盒检查（URL/路径白名单 → ASK）
      const sandbox = this.sandboxWhitelistService.check(convCtx.profile, toolCall.name, args)
      if (sandbox === SandboxDecision.ASK) {
        const approved = await this.requestApproval(convCtx, toolCall, '沙盒限制')
        if (!approved) {
          return APPROVAL_REJECTED_MSG
        }
      }
    }

    // ── 审批检查：需要审批（非 yolo）时挂起 ──
    if (!toolCtx.yolo) {
      const approved = await this.requestApproval(convCtx, toolCall)
      if (!approved) {
        return APPROVAL_REJECTED_MSG
      }
    }

    // ── 执行（ToolContext 直接传入，无中间转换） ──
    let result: string
    try {
      const execResult = await this.toolManager.execute(toolCtx)
      if (execResult.async) {
        // 异步工具：挂起等待外部回调（UI 工具等通过 onToolResult 恢复）
        return this.waitToolResult(convCtx, toolCall.id)
      }
      result = execResult.result
    } catch (e) {
      result = `Error: Tool execution failed: ${(e as Error).message}`
    }

    // ── 工具循环防护：执行后检查（warn 时附加引导文本）──
    const after = guardrail.afterCall(toolCall.name, args, result, classifyToolFailure(toolCall.name, result))
    if (after.action === GuardrailAction.WARN || after.action === GuardrailAction.HALT) {
      console.log(`工具循环防护提示 tool=${toolCall.name} code=${after.code} count=${after.count}`)
      result = appendGuardrailGuidance(result, after)
    }

    // ── 缓存失效（对齐 Java invalidateCacheIfNeeded）：skill_manage/memory 改变 prompt 缓存内容 ──
    if (AgentLoop.CACHE_AFFECTING_TOOLS.has(toolCall.name)) {
      console.log(`清除提示词缓存: tool=${toolCall.name} sessionId=${convCtx.sessionId}`)
      this.promptModuleBuilder.invalidateSessionCache(convCtx.sessionId, convCtx.profile)
    }

    return result
  }

  /**
   * 审批请求：注册挂起等待（60s 超时）→ sender 发审批事件 → 等 onApproval IPC 恢复。
   * 超时视为拒绝 + 发 INTERACTION_STATUS_UPDATE(timed_out) 事件（对齐 Java STATUS_TIMED_OUT）。
   */
  private requestApproval(convCtx: ConversationContext, toolCall: ToolCall, reason?: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.approvalWaiters.delete(toolCall.id)
        // 超时视为拒绝（对齐 Java markApprovalExpired）
        convCtx.sendAction(EVT_INTERACTION_STATUS_UPDATE, {
          toolCallId: toolCall.id,
          interactionStatus: STATUS_TIMED_OUT,
          content: '⏰ 已过期',
          messageType: MSG_TYPE_APPROVAL_REQUEST,
        })
        console.warn(`审批超时，视为拒绝 tool=${toolCall.name} toolCallId=${toolCall.id}`)
        resolve(false)
      }, AgentLoop.APPROVAL_TIMEOUT_MS)
      this.approvalWaiters.set(toolCall.id, {
        resolve: (approved) => {
          clearTimeout(timer)
          resolve(approved)
        },
        timer,
      })
      // 通过 sender 发审批事件（对齐 Java ctx.sendMessage(APPROVAL_REQUEST, ...)）
      convCtx.sendApprovalRequest({
        toolCallId: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments,
        reason,
      })
    })
  }

  /**
   * 等待外部工具结果（60s 超时，直到 onToolResult 恢复）。
   * 超时返回超时结果给 LLM + 发 INTERACTION_STATUS_UPDATE(timed_out) 事件（对齐 Java）。
   */
  private waitToolResult(cycle: ConversationContext, toolCallId: string): Promise<string> {
    return new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        this.toolResultWaiters.delete(toolCallId)
        cycle.sendAction(EVT_INTERACTION_STATUS_UPDATE, {
          toolCallId,
          interactionStatus: STATUS_TIMED_OUT,
          content: '⏰ 已过期',
          messageType: MSG_TYPE_TOOL_RESULT,
        })
        console.warn(`工具结果等待超时 toolCallId=${toolCallId}`)
        resolve('Error: 等待客户端工具结果超时（60s），工具调用已过期')
      }, AgentLoop.CLARIFY_TIMEOUT_MS)
      this.toolResultWaiters.set(toolCallId, {
        resolve: (result) => {
          clearTimeout(timer)
          resolve(result)
        },
        timer,
      })
    })
  }
}
