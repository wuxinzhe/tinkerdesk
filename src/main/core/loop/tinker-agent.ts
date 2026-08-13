/**
 * tinker-agent.ts — 线程模型 TinkerAgent（三级上下文版）
 *
 * 本地客户端用 JS 的 async/await 线程模型，状态保存在函数调用栈里。
 * 上下文管理：SessionContext → ConversationContext → ToolContext
 * 三级继承，所有配置/环境在对话开始前一次性加载，贯穿整个周期。
 *
 * 完整链路：
 *   构建 SessionContext（配置加载）→ 会话加载/创建 → startCycle（ConversationContext）
 *   → 上下文加载（摘要+历史+暂存）→ 提示词构建（system） → LLM 流式调用
 *   → 工具执行（ToolContext）→ 结果回填 → 循环 → 完成 → 落库 → 压缩检查
 *
 * 对外事件：
 *   chat          — 用户消息入口（onUserMessage）
 *   onToolResult  — 工具结果回调（外部工具异步返回时挂起恢复）
 *   onApproval    — 审批响应回调（同意/拒绝）
 *   revoke        — 撤回消息
 *   interrupt     — 中断当前对话（stop）
 *   clearAll      — 清理会话状态
 */
import type { CompactionService } from '../../service/compaction-service'
import type { ConversationService } from '../../service/conversation-service'
import type { MessageService } from '../../service/message-service'
import { MessageFactory } from '../../service/message-service'
import type { ModelConfigService } from '../../service/model-config-service'
import type { SandboxWhitelistService } from '../../service/sandbox-whitelist-service'
import type { SessionService } from '../../service/session-service'
import type { ToolAuthService } from '../../service/tool-auth-service'
import type { LlmRouter } from '../llm/llm-router'
import type { LlmResponse } from '../llm/types'
import type { PromptModuleBuilder } from '../prompt/prompt-module-builder'
import type { ToolManager } from '../tool/tool-manager'
import { ApprovalManager } from './approval-manager'
import {
  EVT_ERROR_AGENT,
  EVT_TIP_QUEUED
} from '../constants'
import type { SessionContext } from './context'
import { Conversation } from './conversation'
import { SessionRuntime } from './session-runtime'
import { ToolCallExecutor } from './tool-call-executor'
import type { TinkerAgentOptions, TinkerAgentResult } from './types'
import { BUSY_MODE_INTERRUPT, BUSY_MODE_REDIRECT } from './types'
import { RES_INTERRUPTED } from './types'

/** 线程模型 TinkerAgent */
export class TinkerAgent {
  private readonly llmRouter: LlmRouter
  private readonly toolManager: ToolManager
  private readonly messageService: MessageService
  private readonly sessionService: SessionService
  private readonly conversationService: ConversationService
  private readonly compactionService: CompactionService
  private readonly promptModuleBuilder: PromptModuleBuilder
  private readonly modelConfigService: ModelConfigService
  /** 用户消息队列（per-session 串行处理）——已下沉 SessionRuntime */
  /** 沙盒白名单服务（工具门检） */
  private readonly sandboxWhitelistService: SandboxWhitelistService
  /** 工具授权服务（工具门检） */
  private readonly toolAuthService: ToolAuthService

  /** 实例绑定：会话 id + profile（OO 化——一个实例服务一个会话） */
  private readonly sessionId: string
  private readonly profile: string
  /** 已释放标记（dispose 幂等） */
  private disposed = false

  /** 会话级运行时状态（队列/中断——P1 下沉 SessionRuntime） */
  private readonly runtime: SessionRuntime

  /** 审批/工具结果管理（会话级——IPC 入口委托到这里） */
  private readonly approvalManager: ApprovalManager

  constructor(options: TinkerAgentOptions) {
    this.sessionId = options.sessionId
    this.profile = options.profile
    this.runtime = new SessionRuntime(options.sessionId, options.profile)
    this.approvalManager = new ApprovalManager(options.messageService)
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
   * chat 入口（onUserMessage 语义）：
   * SessionContext 由外部（controller 经 SessionContextFactory）在对话启动前构建，
   * 装载全部配置（AgentConfig + ClientEnv + YOLO + 回调），此处只消费。
   * - 消息先入队（per-session）
   * - 会话处理中 → 排队等待（发 MESSAGE_QUEUED 提示）
   * - 空闲 → 启动处理循环
   */
  async chat(ctx: SessionContext, userMessage: string): Promise<TinkerAgentResult> {
    const sessionId = this.sessionId

    // ── 1. 消息入队 ──
    this.runtime.queue.enqueueMessage(sessionId, userMessage, this.profile)

    // ── 2. 会话处理中 → 按忙碌模式处置（排队 / 重定向 / 打断） ──
    if (this.runtime.queue.isProcessing(sessionId)) {
      const mode = ctx.agentConfig?.messageBusyMode
      if (mode === BUSY_MODE_REDIRECT) {
        this.runtime.requestRedirect(userMessage)
        ctx.sendTips(EVT_TIP_QUEUED, '已重定向当前对话——正在用你的修正调整…')
        return {
          response: { resType: RES_INTERRUPTED, text: '', toolCalls: [], errorMessage: '已重定向' } as LlmResponse,
          sessionId,
          conversationId: '',
        }
      }
      if (mode === BUSY_MODE_INTERRUPT) {
        this.runtime.requestInterrupt(userMessage)
        ctx.sendTips(EVT_TIP_QUEUED, '已打断当前对话——即将处理你的新消息…')
        return {
          response: { resType: RES_INTERRUPTED, text: '', toolCalls: [], errorMessage: '已打断' } as LlmResponse,
          sessionId,
          conversationId: '',
        }
      }
      // 默认 queue：排队等待（处理循环结束时会自动取下一批）
      ctx.sendTips(EVT_TIP_QUEUED, '消息已入队，等待处理…')
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
   * 处理循环：
   * 设 processing 锁 → while：预算取数 → 合并消息 → 一轮对话 → 队列空退出。
   */
  private async processLoop(ctx: SessionContext): Promise<TinkerAgentResult> {
    const sessionId = this.sessionId
    this.runtime.queue.setProcessing(sessionId, true)
    let lastResult: TinkerAgentResult | null = null
    try {
      while (true) {
        // 中断检查：清队退出
        const abort = this.runtime.getAbort()
        if (abort?.signal.aborted) {
          this.runtime.queue.clearQueue(sessionId)
          break
        }

        // 打断模式：中断的回合退出后——取走 pendingInterrupt 立即处理（不等队列）
        const pendingInterrupt = this.runtime.takePendingInterrupt()

        // 队列空且无打断消息 → 退出
        const allItems = this.runtime.queue.peekAll(sessionId)
        if (allItems.length === 0 && !pendingInterrupt) {
          break
        }

        // 预算驱动取数（打断消息优先——本轮直接处理；否则走队列）
        let combined: string
        if (pendingInterrupt) {
          combined = pendingInterrupt
        } else {
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
            ? this.runtime.queue.dequeueAll(sessionId)
            : this.runtime.queue.dequeueBatch(sessionId, takeCount)

          // 合并多条消息（\n 连接）→ 一轮对话
          combined = items.map((i) => i.content).join('\n')
        }
        // 每轮 new Conversation（生命周期 = 一轮——run 返回后即弃）
        const conversation = new Conversation({
          llmRouter: this.llmRouter,
          toolManager: this.toolManager,
          messageService: this.messageService,
          sessionService: this.sessionService,
          conversationService: this.conversationService,
          compactionService: this.compactionService,
          promptModuleBuilder: this.promptModuleBuilder,
          modelConfigService: this.modelConfigService,
          sandboxWhitelistService: this.sandboxWhitelistService,
          toolAuthService: this.toolAuthService,
          runtime: this.runtime,
          approvalManager: this.approvalManager,
          toolExecutor: new ToolCallExecutor({
            toolManager: this.toolManager,
            sandboxWhitelistService: this.sandboxWhitelistService,
            toolAuthService: this.toolAuthService,
            promptModuleBuilder: this.promptModuleBuilder,
            approvalManager: this.approvalManager,
          }),
        })
        lastResult = await conversation.run(this.sessionId, this.profile, ctx, combined, undefined)
      }
      return lastResult ?? {
        response: { resType: RES_INTERRUPTED, text: '', toolCalls: [], errorMessage: '无消息处理' } as LlmResponse,
        sessionId,
        conversationId: '',
      }
    } catch (e) {
      // 周期异常 → 不静默：错误日志 + errorTip + 尝试落库错误消息（用户可见）
      const err = e instanceof Error ? e : new Error(String(e))
      console.error(`action=LOOP_ERROR sessionId=${sessionId} err=${err.message}\n${err.stack ?? ''}`)
      const convId = (ctx as unknown as { conversationId?: string }).conversationId ?? ''
      try {
        if (convId) {
          this.messageService.saveTempMessage(MessageFactory.buildAssistantText(convId, sessionId, this.profile, `⚠️ 对话处理异常：${err.message}`))
        }
      } catch (saveErr) {
        console.error(`错误消息落库失败: ${(saveErr as Error).message}`)
      }
      ctx.sendError(EVT_ERROR_AGENT, `对话处理异常：${err.message}`)
      throw e // 继续上抛（IPC 拦截层兜底，双保险）
    } finally {
      this.runtime.queue.setProcessing(sessionId, false)
    }
  }

  /**
   * 单轮对话完整链路：
   * 基于已装载的 SessionContext → 对话周期 → LLM 循环 → 工具执行 → 完成。
   * 线程模型本地工具同步执行不经过此方法；UI/扩展工具通过 IPC 回调时调用。
   */
  onToolResult(sessionId: string, toolCallId: string, result: string): boolean {
    return this.approvalManager.onToolResult(sessionId, toolCallId, result)
  }

  /** 本轮对话自动批准：当前挂起审批全部放行 + 后续本轮审批直接放行（前端"本轮自动批准"按钮） */
  setAutoApprove(conversationId: string): void {
    this.approvalManager.setAutoApprove(conversationId)
  }

  /** 审批响应回调（onApprovalResponse）：用户同意/拒绝工具执行。 */
  onApproval(sessionId: string, toolCallId: string, approved: boolean): boolean {
    return this.approvalManager.onApproval(sessionId, toolCallId, approved)
  }

  revoke(sessionId: string, messageId: string): boolean {
    // 从队列移除（仅能撤回尚未处理的入队消息）
    const removed = this.runtime.queue.removeFromQueue(sessionId, messageId)
    if (removed) {
      console.log(`action=REVOKE sessionId=${sessionId} messageId=${messageId}（已从队列移除）`)
      return true
    }
    console.warn(`撤回失败：消息不在队列中，自动中断 sessionId=${sessionId} messageId=${messageId}`)
    // 撤回失败 → 触发中断（消息可能已被处理）
    this.interrupt(sessionId)
    return false
  }

  /**
   * 中断当前对话（onInterrupt / stop）：通过 AbortController 终止 while-loop。
   */
  interrupt(_sessionId: string): boolean {
    return this.runtime.interrupt()
  }

  /** 清理会话状态（clearAll）：取消中断控制 + 清理挂起表 */
  clearAll(sessionId: string): void {
    this.runtime.clearAbort()
    // 清理该会话相关的挂起表项
    this.approvalManager.clearForSession(sessionId)
    console.log(`action=CLEAR-ALL sessionId=${sessionId}`)
  }

  /**
   * 释放实例（OO 生命周期终结）：清队列/中断/挂起表/自动批准——幂等。
   * 会话删除/清空时由 controller 调用，之后实例即被丢弃。
   */
  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.runtime.dispose()
    this.approvalManager.dispose()
    console.log(`action=AGENT-DISPOSE sessionId=${this.sessionId}`)
  }
}
