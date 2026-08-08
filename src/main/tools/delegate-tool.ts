/**
 * delegate-tool.ts — 子代理工具
 *
 * 父 Agent 在工具执行中派生子代理：new TinkerAgent（独立实例）→ 子会话 + ephemeral prompt
 * → chat(goal) 同步等待 → 收集结果 JSON → dispose。
 *
 * 限制：
 * - 深度上限 1（子代理上下文中 delegateDepth=1，再 delegate 直接拒绝）
 * - 子代理不加载记忆（prompt 由父注入 delegated task context）
 * - 子代理事件走子会话 id（前端按 sessionId 订阅，不会串到父会话 UI）
 */
import type { PromptRenderer } from '../core/prompt/renderer'
import type { TinkerAgentOptions } from '../core/loop/types'
import { TinkerAgent } from '../core/loop/tinker-agent'
import type { SessionContextFactory } from '../service/session-context-factory'
import type { SessionService } from '../service/session-service'
import type { ToolContext } from '../core/loop/types'
import { BaseTool } from './base-tool'
import { ToolResult } from '../core/tool/tool-result'

/** 工具名 */
export const TOOL_NAME = 'builtin_tinker_delegate'

/** 子代理最大深度（父=0 → 子=1 → 孙禁止）——对齐 delegation.max_spawn_depth=1 */
const MAX_DEPTH = 1

/** 子代理结果条目 */
interface DelegateTaskItem {
  goal: string
  context?: string
}

/** 子代理装配依赖（延迟解析——bootstrap 装配顺序有循环依赖） */
interface DelegateDeps {
  agentLoopOptions: Omit<TinkerAgentOptions, 'sessionId' | 'profile'>
  sessionContextFactory: SessionContextFactory
  sessionService: SessionService
}

/** 子代理工具 */
export class DelegateTool extends BaseTool {
  private readonly getDeps: () => DelegateDeps

  constructor(renderer: PromptRenderer, getDeps: () => DelegateDeps) {
    super(renderer, TOOL_NAME)
    this.getDeps = getDeps
  }

  /** 执行（父 Agent 工具上下文） */
  async execute(ctx: ToolContext): Promise<ToolResult> {
    const args = (ctx.toolCall.arguments ?? {}) as { goal?: string; context?: string; tasks?: DelegateTaskItem[] }

    // ── 深度检查（防无限递归——子代理不能再 delegate） ──
    const parentDepth = ctx.delegateDepth ?? 0
    if (parentDepth + 1 > MAX_DEPTH) {
      return ToolResult.sync(JSON.stringify({
        error: `子代理深度超限（当前 ${parentDepth + 1}/${MAX_DEPTH}）——子代理不能继续派生`,
      }))
    }

    const items: DelegateTaskItem[] = Array.isArray(args.tasks) && args.tasks.length > 0
      ? args.tasks
      : (args.goal ? [{ goal: args.goal, context: args.context }] : [])

    if (items.length === 0) {
      return ToolResult.sync(JSON.stringify({ error: 'delegate 需要 goal 或 tasks 参数' }))
    }

    const results: Array<{ goal: string; result: string; error?: string }> = []
    for (const item of items) {
      try {
        results.push({ goal: item.goal, result: await this.runChild(ctx, item) })
      } catch (e) {
        results.push({ goal: item.goal, result: '', error: (e as Error).message })
      }
    }

    return ToolResult.sync(JSON.stringify({ results }))
  }

  /** 跑一个子代理（独立会话 + ephemeral prompt + 独立 TinkerAgent 实例） */
  private async runChild(parentCtx: ToolContext, item: DelegateTaskItem): Promise<string> {
    const { agentLoopOptions, sessionContextFactory, sessionService } = this.getDeps()

    // ── 1. 子会话（落库——数据完整；profile 继承父） ──
    const childSession = sessionService.create(parentCtx.profile)
    const childId = childSession.id

    // ── 2. 子上下文（ephemeral system prompt = 子代理人设 + 任务注入） ──
    const childPrompt = [
      '你是主 Agent 派出的子代理，负责完成一个独立子任务。',
      '你不了解主对话的上下文，以下信息是全部已知内容：',
      `任务目标：${item.goal}`,
      item.context ? `背景信息：${item.context}` : '',
      '完成任务后，直接输出最终结果（简洁、可被主 Agent 解析）。',
    ].filter(Boolean).join('\n')

    const childCtx = sessionContextFactory.buildEphemeral({
      sessionId: childId,
      profile: parentCtx.profile,
      sender: parentCtx.sender,
      systemPrompt: childPrompt,
      delegateDepth: (parentCtx.delegateDepth ?? 0) + 1,
    })

    // ── 3. 子 TinkerAgent 实例（独立队列/abort——与父互不干扰） ──
    const child = new TinkerAgent({ ...agentLoopOptions, sessionId: childId, profile: parentCtx.profile })
    try {
      const result = await child.chat(childCtx, item.goal)
      return result.response.text || result.response.errorMessage || '(子代理无输出)'
    } finally {
      child.dispose()
    }
  }
}
