/**
 * conversation.ts — Conversation turn object (OO split P2/P3 + response-branch strategy)
 *
 * The full state and logic of one turn coheres here:
 * - run(): pure orchestration (init → while loop → response dispatch)
 * - handleXxx(): LLM response branch strategy (text / tool_calls / reasoning / truncated / empty / overflow / error)
 * - Tool execution delegated to ToolCallExecutor; approval suspension to ApprovalManager
 * - Wrap-up (flush persistence + stats + events + title generation); compaction (proactive check + overflow handling)
 *
 * Lifecycle = one turn (turn state = instance fields); the object is
 * discarded after run() returns.
 */
import { withTransaction } from '../../repository/database'
import { MessageFactory } from '../../service/message-service'
import { ToolLoopGuardrail } from '../../service/tool-loop-guardrail-service'
import { getShortName } from '../../utils/tool-display'
import {
  EVT_ACTION_TOOL_DONE,
  EVT_ACTION_TOOL_START,
  EVT_ERROR_AGENT,
  EVT_SESSION_BUDGET,
  EVT_SESSION_COMPLETE,
  EVT_SESSION_STATS,
  EVT_SESSION_TITLE,
  EVT_TIP_QUEUED,
  EVT_TIP_WORKING,
  ROLE_ASSISTANT,
  ROLE_SYSTEM,
  ROLE_TOOL,
  ROLE_USER,
} from '../constants'
import { ERROR_CONTEXT_OVERFLOW, RES_EMPTY, RES_REASONING, RES_TEXT, RES_TOOL_CALLS, RES_TRUNCATED } from '../llm/llm-response'
import { repairMessageSequence } from '../llm/message-utils'
import type { ApiMessage, LlmChunk, LlmResponse, LlmRouterOptions, ModelConfig } from '../llm/types'
import { SCENE_CHAT, SCENE_SUMMARY, SCENE_TITLE } from '../llm/types'
import type { ToolSchema } from '../tool/tool-schema'
import { BusyModeRegistry } from './busy-mode-registry'
import type { ConversationContext, SessionContext } from './context'
import { buildConvCtx } from './context'
import type { BusyLoopHost, BusyModeStrategy, ConversationDeps, TinkerAgentResult } from './types'
import { BUSY_MODE_INTERRUPT, BUSY_MODE_REDIRECT, CONV_COMPLETED, RES_INTERRUPTED } from './types'

/** 对话轮次对象 */
export class Conversation implements BusyLoopHost {
  constructor(private readonly deps: ConversationDeps) { }

  // ═══════ 轮状态（实例字段——生命周期 = 本轮） ═══════
  private ctx!: SessionContext
  private abort!: AbortController
  /** 忙碌时消息处置策略（构建时读 agentConfig.messageBusyMode——回合内固定） */
  private strategy!: BusyModeStrategy
  /** 当前 LLM 流已产生的可见文本（redirect 截取检查点用——不含 reasoning） */
  private streamTextAccum = ''
  private convCtx!: ConversationContext
  private messages: ApiMessage[] = []
  private routerOpt!: LlmRouterOptions
  private guardrail!: ToolLoopGuardrail
  private sessionId = ''
  private profile = ''
  private convId = ''
  private iteration = 0
  private llmRequestCount = 0
  /** 本轮 AgentLoop usage 累计（每轮 LLM 响应累加——会话统计用） */
  private tokenAccum = { prompt: 0, completion: 0, cacheRead: 0, cacheWrite: 0 }
  private emptyRetry = 0
  private cycleStart = 0
  private currentToolName = ''
  private workingTimer: NodeJS.Timeout | null = null
  private maxIter = 0

  /** 一轮对话完整链路（纯调度：初始化 → while 循环 → 响应分发）——身份由 TinkerAgent 传入（单一来源） */
  async run(sessionId: string, profile: string, ctx: SessionContext, userMessage: string, userCreatedAt?: string): Promise<TinkerAgentResult> {
    this.sessionId = sessionId
    this.profile = profile
    this.ctx = ctx
    const { runtime, messageService, conversationService, toolManager, promptModuleBuilder, agentToolService } = this.deps

    // 注册中断控制
    this.abort = new AbortController()
    runtime.setAbort(this.abort)

    // ── 对话周期：创建 IN_PROGRESS 对话 + 构建 ConversationContext ──
    const conv = conversationService.startConversation(this.sessionId)
    this.convId = conv.id
    // 装配 toolNameSet：只从当前 Agent 的 mode.getToolset(profile) 获取——不再有 DB 优先/兜底
    // （创造者模式 getToolset 内部按 profile 授权定制 + 空回落全量；极简/通用为静态/全量配置）
    const toolset = this.ctx.agentMode?.getToolset(this.profile) ?? []
    const toolNames = toolManager.getAvailableToolNames(this.profile, toolset.length > 0 ? toolset : null)
    const allConfigs = this.resolveAllConfigs(this.profile)
    this.convCtx = buildConvCtx(ctx, this.convId, toolNames, allConfigs)
    // 忙碌模式策略（构建时读一次——回合内固定——中途修改配置下一轮生效）
    this.strategy = BusyModeRegistry.get(this.convCtx.agentConfig?.messageBusyMode)
    this.streamTextAccum = ''

    // ── 用户消息入暂存 ──
    messageService.saveTempMessage(MessageFactory.buildUserMessage(this.convId, this.sessionId, this.profile, userMessage, userCreatedAt))

    // ── 上下文加载（摘要 + 历史 + 暂存）→ 转 ApiMessage ──
    const history = messageService.loadContextMessages(this.sessionId, this.convId, this.profile)
    // 防御性修复：合并相邻 assistant（tool_calls 后紧跟 assistant = 严格 provider 400——
    // 移植 repair_message_sequence）/ 丢弃游离 tool / 合并 user / 修正 system
    repairMessageSequence(history)

    // ── 提示词构建（system 消息） ──
    const systemPrompt = promptModuleBuilder.buildSystemPrompt(this.convCtx)
    this.messages = []
    if (systemPrompt) {
      this.messages.push({ role: ROLE_SYSTEM, content: systemPrompt })
    }
    this.messages.push(...history)

    const tools = toolManager
      .getAvailableSchemas(this.profile, toolNames)
      .map((s) => s.toFunctionCallingFormat() as unknown as ToolSchema)
    // 推理深度（per-session——sessions.reasoning_depth；'' 不传走模型默认）
    const session = this.deps.sessionService.findById(this.sessionId, this.profile)
    this.routerOpt = {
      scene: SCENE_CHAT,
      messages: this.messages,
      tools,
      modelConfigs: allConfigs.get(SCENE_CHAT) ?? [],
      reasoningDepth: session?.reasoningDepth || undefined,
      // 中断信号（重定向/打断——abort 即断流）
      signal: this.abort.signal,
      // usage 统计上下文
      profile: this.profile,
      sessionId: this.sessionId,
      conversationId: this.convId,
    }

    // ── 长任务提示（执行超过 60s 后每 60s 发一次 tip，cycle 结束自停） ──
    this.cycleStart = Date.now()
    this.iteration = 0
    this.llmRequestCount = 0
    this.emptyRetry = 0
    this.currentToolName = ''
    this.maxIter = this.convCtx.agentConfig.maxIterations
    // 本轮 usage 累计（AgentLoop 每轮响应都累加——会话统计不能只取最后一次响应）
    this.tokenAccum = { prompt: 0, completion: 0, cacheRead: 0, cacheWrite: 0 }
    this.scheduleWorkingTip()
    // 事件埋点：回合开始
    this.deps.rpc.recordEvent({
      sessionId: this.sessionId,
      conversationId: this.convId,
      eventType: 'conversation',
      eventName: 'turn_start',
      payload: { profile, maxIter: this.maxIter, userText: userMessage.slice(0, 80) },
    })

    try {
      // ── while-loop：LLM 调用 ↔ 工具执行 ──
      this.guardrail = new ToolLoopGuardrail(this.convCtx.agentConfig)

      while (true) {
        // abort 检查（统一处理 redirect 竞态窗口）：
        // - LLM 流进行中被 abort → SDK 抛 AbortError → catch 分支调用
        // - LLM 流已结束 + abort 生效（竞态）→ 循环顶检查调用
        // redirect 模式：pending 修正存在 → 注入 + 重建 abort → 继续循环（不退出）
        if (!(await this.handleLoopAbort())) break

        this.iteration++
        if (this.maxIter > 0 && this.iteration > this.maxIter) {
          return this.handleMaxIteration()
        }

        let response: LlmResponse
        try {
          response = await this.deps.llmRouter.chat(this.routerOpt, (chunk: LlmChunk) => {
            // 累计当前流可见文本（redirect 截取检查点用——不含 reasoning）
            if (chunk.text) this.streamTextAccum += chunk.text
            this.convCtx.sender.sendToken(this.sessionId, chunk)
          })
        } catch (e) {
          // 中断（重定向/打断/手动停止）——AbortError 或 abort 信号已生效
          // （SDK 可能抛非 AbortError 名，如 TypeError: fetch aborted）→ 统一走策略处置
          if ((e as Error).name === 'AbortError' || this.abort.signal.aborted) {
            if (await this.handleLoopAbort()) {
              continue // redirect：注入修正后继续循环
            }
            break // interrupt/queue：退出循环
          }
          throw e
        }
        this.llmRequestCount++

        // ── 每轮 usage 累计（prompt/completion/cache——会话统计数据源） ──
        if (response.promptTokens !== undefined || response.completionTokens !== undefined) {
          this.tokenAccum.prompt += response.promptTokens ?? 0
          this.tokenAccum.completion += response.completionTokens ?? 0
          this.tokenAccum.cacheRead += response.cacheReadTokens ?? 0
          this.tokenAccum.cacheWrite += response.cacheWriteTokens ?? 0
        }

        // ── 剩余 token 预算（contextLimit × 0.85 - promptTokens） ──
        this.emitBudgetUpdate(response)

        // ── 响应分发（策略化——每个 resType 一个 handler） ──
        let result: TinkerAgentResult | null
        switch (response.resType) {
          case RES_TEXT:
            result = await this.handleText(response)
            break
          case RES_TOOL_CALLS:
            result = await this.handleToolCalls(response)
            break
          case RES_REASONING:
            result = this.handleReasoning(response)
            break
          case RES_TRUNCATED:
            result = this.handleTruncated(response)
            break
          case RES_EMPTY:
            result = await this.handleEmpty(response)
            break
          case ERROR_CONTEXT_OVERFLOW:
            result = await this.handleOverflowResponse(response)
            break
          default:
            result = this.handleError(response)
            break
        }
        if (result) {
          return result
        }
      }

      // 中断触发（redirect 已在 catch 分支继续——到这里是 interrupt/queue 退出）
      await this.strategy.onRunExit?.(this)
      this.deps.runtime.clearBusyState()
      // 提示按策略区分：queue（手动停止/排队场景）→「对话已中断」；
      // interrupt 模式 → 不发（chat 入口已发「已打断——即将处理你的新消息」——
      // 避免复用手动停止链路造成重复/语义冲突）
      if (this.strategy.mode !== BUSY_MODE_INTERRUPT) {
        this.ctx.sendTips(EVT_TIP_QUEUED, '对话已中断')
      }
      return this.finishCycle(this.convCtx, {
        resType: RES_INTERRUPTED,
        text: '',
        toolCalls: [],
        errorMessage: '对话已被用户中断',
      } as LlmResponse)
    } finally {
      // 清理长任务提示定时器
      if (this.workingTimer) {
        clearTimeout(this.workingTimer)
        this.workingTimer = null
      }
      this.deps.runtime.clearAbort()
    }
  }

  // ═══════ LLM 响应分支（策略化——返回 null 继续循环，非 null 结束本轮） ═══════

  /** RES_TEXT：完成——助手消息持久化 + 主动压缩检查 + 收尾 */
  private async handleText(response: LlmResponse): Promise<TinkerAgentResult | null> {
    // usage 落 message（命中率数据源）
    this.deps.messageService.saveTempMessage(
      MessageFactory.buildAssistantText(this.convId, this.sessionId, this.profile, response.text, {
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        cacheReadTokens: response.cacheReadTokens,
        cacheWriteTokens: response.cacheWriteTokens,
      }),
    )
    await this.checkCompaction(this.convCtx, response)
    return this.finishCycle(this.convCtx, response)
  }

  /** RES_TOOL_CALLS：工具调用——保存消息 + 回填上下文 + 逐个执行 + 结果回填 */
  private async handleToolCalls(response: LlmResponse): Promise<TinkerAgentResult | null> {
    const { messageService } = this.deps
    messageService.saveTempMessage(
      MessageFactory.buildAssistantToolCall(
        this.convId,
        this.sessionId,
        this.profile,
        response.reasoningContent ?? '',
        Object.fromEntries(response.toolCalls.map((tc) => [tc.id, { name: tc.name, arguments: tc.arguments }])),
        response.text,
        {
          promptTokens: response.promptTokens,
          completionTokens: response.completionTokens,
          cacheReadTokens: response.cacheReadTokens,
          cacheWriteTokens: response.cacheWriteTokens,
        }
      )
    )
    // 工具轮次开始：重置防护计数
    this.guardrail.resetForTurn()
    // 工具执行中标记（redirect/interrupt 策略据此决定 abort 时机——不杀工具）
    this.deps.runtime.setExecutingTools(true)
    // 回填 LLM 上下文：assistant tool_calls 消息（tool 结果消息的前置，缺失会导致 API 400）
    this.messages.push({
      role: ROLE_ASSISTANT,
      content: [response.text, response.reasoningContent].filter(Boolean).join('\n'),
      toolCall: JSON.stringify(response.toolCalls.map((tc) => ({ id: tc.id, name: tc.name, arguments: tc.arguments }))),
    })
    for (const tc of response.toolCalls) {
      this.currentToolName = tc.name
      // 工具开始事件
      this.convCtx.sender.sendAction(this.sessionId, EVT_ACTION_TOOL_START, { toolName: tc.name })
      const result = await this.deps.toolExecutor.execute(this.convCtx, tc, this.guardrail)
      // 工具完成事件
      this.convCtx.sender.sendAction(this.sessionId, EVT_ACTION_TOOL_DONE, { toolCallId: tc.id, toolName: tc.name, success: true })
      // 工具结果持久化 + 回填 LLM 上下文
      messageService.saveTempMessage(MessageFactory.buildToolResult(this.convId, this.sessionId, this.profile, tc.id, result))
      this.messages.push({
        role: ROLE_TOOL,
        content: result,
        toolCallId: tc.id,
        name: tc.name,
      })
    }
    // 工具执行结束（redirect/interrupt 策略据此决定 abort 时机）
    this.deps.runtime.setExecutingTools(false)
    // 工具执行中收到打断请求 → 工具完成后 abort（下个迭代 while 条件退出）
    if (this.deps.runtime.hasPendingInterrupt()) {
      this.abort.abort()
    }
    // 语音打断（pendingBarge）→ 工具完成后强制 abort——挂起的 redirect 修正转
    // pendingInterrupt（VAD 场景：说完的话作为新回合处理——而非 redirect 重试继续原命令）
    if (this.deps.runtime.takePendingBarge()) {
      console.log(`action=VOICE-BARGE-APPLIED sessionId=${this.sessionId}`)
      this.deps.runtime.bargeToInterrupt()
      this.abort.abort()
    }
    // 继续 while 循环 → 下一轮 LLM 调用
    return null
  }

  /** RES_REASONING：纯推理（thinking prefilling）→ 保存推理内容，继续 */
  private handleReasoning(response: LlmResponse): TinkerAgentResult | null {
    this.deps.messageService.saveTempMessage(MessageFactory.buildAssistantThinking(this.convId, this.sessionId, this.profile, response.reasoningContent ?? ''))
    return null
  }

  /** RES_TRUNCATED：响应被截断——保存已产出内容 + 注入 continue 提示 */
  private handleTruncated(response: LlmResponse): TinkerAgentResult | null {
    const { messageService } = this.deps
    if (response.reasoningContent) {
      messageService.saveTempMessage(MessageFactory.buildAssistantThinking(this.convId, this.sessionId, this.profile, response.reasoningContent))
    }
    if (response.text) {
      messageService.saveTempMessage(MessageFactory.buildAssistantText(this.convId, this.sessionId, this.profile, response.text))
    }
    messageService.saveTempMessage(MessageFactory.buildUserMessage(this.convId, this.sessionId, this.profile, 'Your response was truncated due to token limits. Please continue from where you left off, do not repeat what has already been written.'))
    return null
  }

  /** RES_EMPTY：空响应——注入继续提示（带重试保护，连续 3 次终止） */
  private async handleEmpty(_response: LlmResponse): Promise<TinkerAgentResult | null> {
    const { messageService } = this.deps
    this.emptyRetry++
    if (this.emptyRetry >= 3) {
      console.error(`连续 ${this.emptyRetry} 次空响应，结束对话 sessionId=${this.sessionId}`)
      messageService.saveTempMessage(MessageFactory.buildAssistantText(this.convId, this.sessionId, this.profile, '⚠️ 模型连续返回空响应，对话已结束'))
      this.ctx.sendError(EVT_ERROR_AGENT, '模型连续返回空响应')
      return this.finishCycle(this.convCtx, {
        resType: RES_INTERRUPTED,
        text: '',
        toolCalls: [],
        errorMessage: '模型连续返回空响应',
      } as LlmResponse)
    }
    const hasToolResults = this.messages.some((m) => m.role === ROLE_TOOL)
    messageService.saveTempMessage(MessageFactory.buildUserMessage(
      this.convId,
      this.sessionId,
      this.profile,
      hasToolResults ? '您刚执行了工具调用但未返回有效响应，请根据上面的工具结果继续处理任务。' : '请继续回答用户的问题。'
    ))
    return null
  }

  /** ERROR_CONTEXT_OVERFLOW：上下文溢出——触发压缩 → 成功继续，失败结束 */
  private async handleOverflowResponse(response: LlmResponse): Promise<TinkerAgentResult | null> {
    const compacted = await this.handleOverflow(this.convCtx)
    if (compacted) {
      return null
    }
    return this.finishCycle(this.convCtx, response)
  }

  /** 其它错误/异常响应 → 不静默：落库 + errorTip + 错误日志 */
  private handleError(response: LlmResponse): TinkerAgentResult | null {
    const errMsg = response.errorMessage || '对话处理失败'
    console.error(`action=CYCLE_ERROR sessionId=${this.sessionId} convId=${this.convId} resType=${response.resType} err=${errMsg}`)
    this.deps.messageService.saveTempMessage(MessageFactory.buildAssistantText(this.convId, this.sessionId, this.profile, `⚠️ ${errMsg}`))
    this.ctx.sendError(EVT_ERROR_AGENT, errMsg)
    return this.finishCycle(this.convCtx, response)
  }

  /** 达到最大迭代次数：中断并发错误消息 */
  private handleMaxIteration(): TinkerAgentResult {
    console.warn(`达到最大迭代次数 ${this.maxIter} sessionId=${this.sessionId} convId=${this.convId}`)
    this.deps.messageService.saveTempMessage(MessageFactory.buildAssistantText(this.convId, this.sessionId, this.profile, '对话已达到最大迭代次数，已被中断'))
    this.ctx.sendTips(EVT_TIP_WORKING, '对话已达到最大迭代次数，已被中断')
    return this.finishCycle(this.convCtx, {
      resType: RES_INTERRUPTED,
      text: '',
      toolCalls: [],
      errorMessage: `对话已达到最大迭代次数 ${this.maxIter}，已被中断`,
    } as LlmResponse)
  }

  // ═══════ 轮内工具 ═══════

  /** 剩余 token 预算事件（contextLimit × 0.85 - promptTokens） */
  private emitBudgetUpdate(response: LlmResponse): void {
    const mainCfg = this.convCtx.getMainModelConfig()
    if (response.promptTokens !== undefined && mainCfg) {
      const budget = Math.max(Math.floor(mainCfg.contextLimit * 0.85) - response.promptTokens, 0)
      this.convCtx.sender.sendSession(this.sessionId, EVT_SESSION_BUDGET, { remainingTokens: budget, contextLimit: mainCfg.contextLimit })
    }
  }

  /** 长任务提示调度（执行超过 60s 后每 60s 发一次 tip） */
  private scheduleWorkingTip(): void {
    this.workingTimer = setTimeout(() => {
      const elapsedSec = (Date.now() - this.cycleStart) / 1000
      if (elapsedSec >= 60) {
        const min = Math.floor(elapsedSec / 60)
        const toolName = this.currentToolName ? getShortName(this.currentToolName) : ''
        this.ctx.sendTips(EVT_TIP_WORKING, `⏳ Tinker 工作中：已执行${min}分钟 — 当前轮次${this.iteration}/${this.maxIter}${toolName ? `,调用中的工具：${toolName}` : ''}`)
      }
      this.scheduleWorkingTip()
    }, 60_000)
  }

  /** 周期结束：对话标记完成 + 消息落库 + token 统计 + 事件 */
  private finishCycle(convCtx: ConversationContext, response: LlmResponse): TinkerAgentResult {
    const { sessionId, conversationId: convId, profile } = convCtx
    const { approvalManager, messageService, conversationService, sessionService } = this.deps
    const cycleStats = { durationMs: Date.now() - this.cycleStart, iterationCount: this.iteration, llmRequestCount: this.llmRequestCount }
    // 事件埋点：回合结束（含原因——completed/max_iter/error 等）
    this.deps.rpc.recordEvent({
      sessionId: this.sessionId,
      conversationId: this.convId,
      eventType: 'conversation',
      eventName: 'turn_end',
      payload: {
        durationMs: cycleStats.durationMs,
        iterationCount: cycleStats.iterationCount,
        llmRequestCount: cycleStats.llmRequestCount,
        promptTokens: this.tokenAccum.prompt,
        completionTokens: this.tokenAccum.completion,
      },
      latencyMs: cycleStats.durationMs,
    })
    // 本轮自动批准标记随周期结束清除（下一次对话重新生效审批）
    approvalManager.clearAutoApprove(convId)
    // 收尾三步（消息落库 + 对话状态 + 会话统计）事务原子——任一步失败整体回滚，
    // 避免"消息落了但状态没更新"的部分写入不一致
    withTransaction(() => {
      // 暂存消息落库（先 flush——拿到本轮上下文总量：最后一条 assistant 消息的 prompt_tokens）
      const roundContextTokens = messageService.flushConversation(convId)
      // 对话完成（usage 更新 conversation——当前轮次的缓存数据 + 运行统计 + 本轮上下文总量）
      conversationService.updateStatus(convId, sessionId, CONV_COMPLETED, {
        cacheReadTokens: response.cacheReadTokens ?? 0,
        cacheWriteTokens: response.cacheWriteTokens ?? 0,
        totalTokens: (response.promptTokens ?? 0) + (response.completionTokens ?? 0),
        durationMs: cycleStats.durationMs,
        iterationCount: cycleStats.iterationCount,
        llmRequestCount: cycleStats.llmRequestCount,
        roundContextTokens,
        completedAt: new Date().toISOString(),
      })
      // 会话 token 统计（本轮 AgentLoop 全部响应累计——不是最后一条）
      if (this.tokenAccum.prompt > 0 || this.tokenAccum.completion > 0) {
        sessionService.accumulateTokens(
          sessionId,
          profile,
          this.tokenAccum.prompt,
          this.tokenAccum.completion,
          this.tokenAccum.cacheRead,
          this.tokenAccum.cacheWrite,
          cycleStats.durationMs,
          cycleStats.iterationCount,
          cycleStats.llmRequestCount,
          roundContextTokens
        )
      }
    })
    // 标题生成（异步，失败不影响主流程）
    void this.generateTitleAsync(convCtx)
    // 周期完成事件 + 统计数据（一边发事件一边落库）
    const statsData = (() => {
      try {
        const mainCfg = convCtx.getMainModelConfig()
        const prompt = response.promptTokens ?? 0
        const cacheRead = response.cacheReadTokens ?? 0
        const contextLimit = mainCfg?.contextLimit ?? 0
        // 回复提醒开关（per-session——complete 音效由前端按此判断）
        let notifyOnComplete = false
        try {
          const session = this.deps.sessionService.findById(sessionId, profile)
          notifyOnComplete = session?.notifyOnComplete ?? false
        } catch {
          // 会话查询失败——默认不提醒
        }
        return {
          model: mainCfg?.modelName ?? '',
          promptTokens: prompt,
          completionTokens: response.completionTokens ?? 0,
          cacheReadTokens: cacheRead,
          cacheWriteTokens: response.cacheWriteTokens ?? 0,
          hitRate: prompt > 0 ? Math.min(cacheRead / prompt, 1) : 0,
          contextLimit,
          contextUsedPercent: contextLimit > 0 ? Math.min(prompt / contextLimit, 1) : 0,
          notifyOnComplete,
        }
      } catch (e) {
        console.warn(`[stats] 统计数据计算失败: ${(e as Error).message}`)
        return null
      }
    })()
    // 对话完成事件（带本轮统计 + convId——前端数据面板可直接消费；多会话并发按 convId 区分）
    convCtx.sender.sendSession(convCtx.sessionId, EVT_SESSION_COMPLETE, statsData, convCtx.conversationId)
    // 统计数据事件（独立通道——面板实时更新）
    if (statsData) {
      try {
        convCtx.sender.sendSession(convCtx.sessionId, EVT_SESSION_STATS, statsData)
      } catch (e) {
        console.warn(`[stats] 统计数据事件发送失败: ${(e as Error).message}`)
      }
    }
    return { response, sessionId, conversationId: convId }
  }

  /** 对话标题生成（异步，非阻塞） */
  private async generateTitleAsync(convCtx: ConversationContext): Promise<void> {
    const { sessionId, conversationId: convId, profile } = convCtx
    const { messageService, llmRouter, sessionService } = this.deps
    try {
      const history = messageService.loadContextMessages(sessionId, convId, profile)
      // 标题生成同样走防御性修复（历史可能含游离 tool/相邻 assistant）
      repairMessageSequence(history)
      const allConfigs = this.resolveAllConfigs(profile)
      const routerCtx: LlmRouterOptions = {
        scene: SCENE_TITLE,
        messages: history,
        tools: [],
        modelConfigs: allConfigs.get(SCENE_TITLE) ?? [],
        profile,
        sessionId,
        conversationId: convId,
      }
      const resp = await llmRouter.execute(routerCtx)
      const title = (resp.text || '').trim().slice(0, 50)
      if (title) {
        sessionService.updateTitle(sessionId, title, profile)
        convCtx.sender.sendSession(convCtx.sessionId, EVT_SESSION_TITLE, { title })
        console.log(`action=TITLE_GENERATED sessionId=${sessionId} title=${title}`)
      }
    } catch (e) {
      console.warn(`标题生成失败（不影响主流程）: ${(e as Error).message}`)
    }
  }

  /** 解析全部场景的模型配置（对话开始前一次性加载——本地单用户：全场景共用同一份） */
  private resolveAllConfigs(profile: string): Map<string, ModelConfig[]> {
    const map = new Map<string, ModelConfig[]>()
    // per-scene 解析：场景主模型优先 → 备用 → 场景无绑定回退主对话场景主模型
    for (const scene of [SCENE_CHAT, SCENE_SUMMARY, SCENE_TITLE]) {
      map.set(scene, this.deps.modelConfigService.resolveForScene(profile, scene))
    }
    return map
  }

  /** 主动压缩检查（阈值 + 冷却控制） */
  private async checkCompaction(convCtx: ConversationContext, response: LlmResponse): Promise<void> {
    try {
      const mainConfig = convCtx.getMainModelConfig()
      if (!mainConfig || response.promptTokens === undefined) {
        return
      }
      const threshold = convCtx.agentConfig.thresholdPercent
      if (this.deps.compactionService.shouldCompact(convCtx.sessionId, convCtx.profile, mainConfig, threshold, response.promptTokens)) {
        const compressConfig = convCtx.getConfigByScene(SCENE_SUMMARY) ?? mainConfig
        await this.deps.compactionService.compact(convCtx.sessionId, convCtx.profile, mainConfig.contextLimit, convCtx.agentConfig.tailRatio, compressConfig)
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
        const success = await this.deps.compactionService.compact(
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

  // ═══════════ BusyLoopHost 实现（redirect/interrupt 策略宿主） ═══════════

  /**
   * abort/pending 统一处置（循环顶 + catch 共用——消除竞态窗口）：
   * - redirect 模式：pending 修正存在且不在工具执行中 → 注入 + 重建 abort → true（继续）
   *   （未 abort 也检查——工具完成后/LLM 间隙的挂起修正不依赖 abort 触发）
   * - 未 abort → true（继续循环）
   * - abort 且无 pending（interrupt/queue/手动停止）→ false（退出）
   */
  private async handleLoopAbort(): Promise<boolean> {
    if (this.strategy.mode === BUSY_MODE_REDIRECT) {
      // 工具执行中不注入（等安全边界——避免打断工具）；工具完成后/LLM 间隙注入
      if (!this.deps.runtime.isExecutingTools()) {
        const pending = this.deps.runtime.takePendingRedirect()
        if (pending) {
          await this.applyActiveTurnRedirect(pending)
          this.resetAbort()
          return true
        }
      }
    }
    if (!this.abort.signal.aborted) return true
    // 事件埋点：回合中断退出（interrupt/queue/手动停止）
    this.deps.rpc.recordEvent({
      sessionId: this.sessionId,
      conversationId: this.convId,
      eventType: 'conversation',
      eventName: 'abort',
      payload: { mode: this.strategy.mode, iteration: this.iteration },
    })
    return false
  }

  /** 取走挂起的重定向修正（strategy 调用——转发 runtime） */
  takePendingRedirect(): string | null {
    return this.deps.runtime.takePendingRedirect()
  }

  /** 注入修正并重建 abort（redirect 继续循环前）——_apply_active_turn_redirect */
  async applyActiveTurnRedirect(pending: string): Promise<void> {
    const visible = this.streamTextAccum.trim()
    // 检查点：截取可见文本（剥离 reasoning——原始思考绝不回放）
    const checkpoint = [
      '[This response was interrupted by a user correction.]',
      visible ? `Visible response before the interruption: ${visible}` : '',
      `User correction: ${pending}`,
    ]
      .filter(Boolean)
      .join('\n')
    // 注入为 user 消息（尾部是 assistant → 单条 user——角色交替合法）
    this.messages.push({ role: ROLE_USER, content: checkpoint })
    // 存储字段分离（）：content 干净（显示原本信息——用户原话）——apiContent 完整检查点（LLM 上下文）
    this.deps.messageService.saveTempMessage(
      MessageFactory.buildUserMessage(this.convId, this.sessionId, this.profile, pending, undefined, checkpoint)
    )
    this.streamTextAccum = ''
    // 事件埋点：重定向注入（用户修正——排查 redirect 链路）
    this.deps.rpc.recordEvent({
      sessionId: this.sessionId,
      conversationId: this.convId,
      eventType: 'conversation',
      eventName: 'redirect',
      payload: { pendingText: pending.slice(0, 80), checkpointLen: checkpoint.length },
    })
    console.log(`action=REDIRECT-APPLIED sessionId=${this.sessionId} convId=${this.convId}`)
  }

  /** 重建 AbortController（redirect 继续循环前） */
  resetAbort(): void {
    this.abort = new AbortController()
    this.deps.runtime.setAbort(this.abort)
    this.routerOpt.signal = this.abort.signal
  }

  /** flush 暂存消息到 DB（interrupt 退出前——防对话消息丢失） */
  async flushPendingMessagesToDb(): Promise<void> {
    this.deps.messageService.flushConversation(this.convId)
  }
}
