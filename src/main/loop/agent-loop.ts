/**
 * agent-loop.ts — 线程模型 AgentLoop（完整接入 + 事件接口）
 *
 * 本地客户端用 JS 的 async/await 线程模型，状态保存在函数调用栈里。
 * 完整链路：
 *   会话加载/创建 → 对话周期开始 → 上下文加载（历史+暂存）
 *   → 提示词构建（system） → LLM 流式调用 → 工具执行 → 结果回填 → 循环
 *   → 完成 → 消息落库（flush） → 会话 token 统计
 *
 * 对外事件（对齐状态机版 ConversationEngine / showing-agent IConversationEngine）：
 *   chat          — 用户消息入口（onUserMessage）
 *   onToolResult  — 工具结果回调（外部工具异步返回时挂起恢复）
 *   onApproval    — 审批响应回调（同意/拒绝）
 *   revoke        — 撤回消息
 *   interrupt     — 中断当前对话（stop）
 *   clearAll      — 清理会话状态
 */
import { randomUUID } from 'crypto'
import type { ToolCall } from '../../defines/models/message'
import type { ToolSchema } from '../../defines/tools/base-tool'
import { SCENE_SUMMARY } from '../llm/llm-operation'
import { RES_REASONING, RES_TEXT, RES_TOOL_CALLS } from '../llm/llm-response'
import type { LlmRouter } from '../llm/llm-router'
import type { ApiMessage, LlmResponse, LlmRouterContext, ModelConfig, TokenCallback } from '../llm/types'
import type { PromptModuleBuilder } from '../prompt/prompt-module-builder'
import type { PromptContext } from '../prompt/types'
import type { CompactionService } from '../service/compaction-service'
import type { ConversationService } from '../service/conversation-service'
import type { MessageService } from '../service/message-service'
import { MessageFactory } from '../service/message-service'
import type { SessionService } from '../service/session-service'
import type { ToolManager } from '../tools/tool-manager'
import type { ToolExecutionContext } from '../tools/types'
import {
  SCENE_CHAT,
  CONV_IN_PROGRESS,
  CONV_COMPLETED,
  CONV_COMPRESSED,
} from './types'
import type { ThreadSession, AgentLoopOptions, AgentLoopResult } from './types'

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
  private createRouterContext(): LlmRouterContext {
    return {
      getModelConfigs: (scene: string) => this.resolveModelConfigs(scene),
    }
  }

  /** 工具 Schema 列表（转成 llm 层需要的 OpenAI function calling 格式） */
  private getToolSchemas(profile: string): ToolSchema[] {
    return this.toolManager
      .getAvailableSchemas(profile)
      .map((s) => s.toFunctionCallingFormat() as unknown as ToolSchema)
  }

  /** 构建 PromptContext（供提示词模块使用） */
  private buildPromptContext(sessionId: string, profile: string): PromptContext {
    return {
      sessionId,
      profile,
      toolNames: this.toolManager.getAvailableToolNames(profile),
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 对外事件（对齐 showing-agent IConversationEngine）
  // ══════════════════════════════════════════════════════════════

  /**
   * 用户消息入口（onUserMessage）：单轮对话完整链路。
   * 流式 token 通过 session.onToken 回调，返回最终 AgentLoopResult。
   */
  async chat(session: ThreadSession, userMessage: string): Promise<AgentLoopResult> {
    // ── 1. 会话：存在则加载，不存在则创建 ──
    let sessionId = session.sessionId
    if (!sessionId) {
      const created = this.sessionService.create(session.profile)
      sessionId = created.id
    }
    const sessionEntity = this.sessionService.findById(sessionId)
    if (!sessionEntity) {
      throw new Error(`会话不存在: ${sessionId}`)
    }

    // 注册中断控制
    const abort = new AbortController()
    this.abortControllers.set(sessionId, abort)

    // ── 2. 对话周期：创建 IN_PROGRESS 对话 ──
    const convId = randomUUID()
    this.conversationService.save({
      id: convId,
      sessionId,
      status: CONV_IN_PROGRESS,
      messageCount: 0,
      estimatedTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      startedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      completedAt: null,
    })

    // ── 3. 用户消息入暂存 ──
    this.messageService.saveTempMessage(MessageFactory.buildUserMessage(convId, sessionId, session.profile, userMessage))

    // ── 4. 上下文加载（历史 + 当前暂存）→ 转 ApiMessage ──
    const history = this.messageService.loadContextMessages(sessionId, convId, session.profile)

    // ── 5. 提示词构建（system 消息） ──
    const systemPrompt = this.promptModuleBuilder.buildSystemPrompt(this.buildPromptContext(sessionId, session.profile))
    const messages: ApiMessage[] = []
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    messages.push(...history)

    const ctx = this.createRouterContext()
    const tools = this.getToolSchemas(session.profile)

    try {
      // ── 6. while-loop：LLM 调用 ↔ 工具执行 ──
      while (!abort.signal.aborted) {
        const response = await this.llmRouter.chat(SCENE_CHAT, ctx, messages, tools, session.onToken ?? (() => { }))

        switch (response.resType) {
          case RES_TEXT:
            // 完成：助手消息持久化 + 返回
            this.messageService.saveTempMessage(MessageFactory.buildAssistantText(convId, sessionId, session.profile, response.text))
            // 主动压缩检查（阈值 + 冷却控制）
            await this.checkCompaction(session, sessionId, session.profile, response)
            return this.finishCycle(session, sessionId, convId, response)

          case RES_TOOL_CALLS:
            // 工具调用：保存工具调用消息 + 逐个执行 + 结果回填
            this.messageService.saveTempMessage(
              MessageFactory.buildAssistantToolCall(
                convId,
                sessionId,
                session.profile,
                response.reasoningContent ?? '',
                Object.fromEntries(response.toolCalls.map((tc) => [tc.id, { name: tc.name, arguments: tc.arguments }]))
              )
            )
            for (const tc of response.toolCalls) {
              session.onToolStart?.(tc.name)
              const result = await this.executeToolCall(session, sessionId, convId, tc)
              // 工具结果持久化 + 回填 LLM 上下文
              this.messageService.saveTempMessage(MessageFactory.buildToolResult(convId, sessionId, session.profile, tc.id, result))
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
            this.messageService.saveTempMessage(MessageFactory.buildAssistantThinking(convId, sessionId, session.profile, response.reasoningContent ?? ''))
            break

          default:
            // 错误/空响应 → 结束周期返回
            return this.finishCycle(session, sessionId, convId, response)
        }
      }

      // 中断触发
      return this.finishCycle(session, sessionId, convId, {
        resType: 'INTERRUPTED',
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

  /** 主动压缩检查：LLM 调用接近上下文上限时触发压缩（阈值 + 冷却控制） */
  private async checkCompaction(session: ThreadSession, sessionId: string, profile: string, response: LlmResponse): Promise<void> {
    try {
      const mainConfig = this.resolveModelConfigs(SCENE_CHAT)[0]
      if (!mainConfig || response.promptTokens === undefined) {
        return
      }
      const threshold = session.agentConfig?.thresholdPercent ?? 0.5
      if (this.compactionService.shouldCompact(sessionId, profile, mainConfig, threshold, response.promptTokens)) {
        const compressConfig = this.resolveModelConfigs(SCENE_SUMMARY)[0] ?? mainConfig
        const tailRatio = session.agentConfig?.tailRatio ?? 0.2
        await this.compactionService.compact(sessionId, profile, mainConfig.contextLimit, tailRatio, compressConfig)
      }
    } catch (e) {
      console.warn(`主动压缩检查异常（不影响主流程）: ${(e as Error).message}`)
    }
  }

  /** 周期结束：对话标记完成 + 消息落库 + token 统计 */
  private finishCycle(session: ThreadSession, sessionId: string, convId: string, response: LlmResponse): AgentLoopResult {
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
  private async executeToolCall(session: ThreadSession, sessionId: string, convId: string, toolCall: ToolCall): Promise<string> {
    // ── 审批检查：需要审批（非 yolo 且配置了审批回调）时挂起 ──
    if (!session.yolo && session.onApprovalRequest) {
      const approved = await this.requestApproval(session, sessionId, toolCall)
      if (!approved) {
        return '用户拒绝执行'
      }
    }

    const execCtx: ToolExecutionContext = {
      sessionId,
      conversationId: convId,
      profile: session.profile,
      connectId: session.connectId,
      yolo: session.yolo,
      toolCall,
      sendAction: (_eventType, _payload) => {
        // 本地执行，无客户端派发
      },
      sendMessage: (_eventType, _payload) => {
        // 本地执行，无客户端派发
      },
    }

    const result = await this.toolManager.execute(execCtx)
    if (result.async) {
      // 异步工具：挂起等待外部回调（UI 工具等通过 onToolResult 恢复）
      return this.waitToolResult(toolCall.id)
    }
    return result.result
  }

  /** 审批请求：注册挂起等待 → 调 onApprovalRequest 回调 → 等 onApproval 恢复 */
  private requestApproval(session: ThreadSession, sessionId: string, toolCall: ToolCall): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.approvalWaiters.set(toolCall.id, { resolve })
      // 通知 UI 弹审批卡片
      const approvedPromise = session.onApprovalRequest?.(toolCall)
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
