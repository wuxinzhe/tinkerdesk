/**
 * memory-tool.ts — 记忆工具
 *
 * 复刻 showing-agent MemoryTool：
 * 读取/添加/替换/删除/批量操作持久记忆（文件系统 MemoryStore）。
 * 全部返回 JSON 字符串，语义对齐 Java 版 7 种响应。
 */
import type {PromptRenderer} from '../prompt/renderer'
import {BaseTool} from './base-tool'
import type {ToolExecutionContext} from './types'
import {ToolResult} from './tool-result'
import {MemoryStore} from '../service/memory-store'
import type {MemoryOperation} from '../service/memory-store'

/** 工具名（对齐 @AgentTool(name)） */
export const TOOL_NAME = 'server_showing_memory'

/** 单轮最多 consolidation 失败次数（对齐 MAX_CONSOLIDATION_FAILURES_PER_TURN） */
const MAX_CONSOLIDATION_FAILURES = 3

/** 记忆工具 */
export class MemoryTool extends BaseTool {
  private readonly consolidationFailures = new Map<string, number>()
  private readonly memoryStore: MemoryStore
  private readonly maxMemory: number
  private readonly maxUser: number

  constructor(renderer: PromptRenderer, memoryStore: MemoryStore, maxMemory = 20000, maxUser = 1375) {
    super(renderer, TOOL_NAME)
    this.memoryStore = memoryStore
    this.maxMemory = maxMemory
    this.maxUser = maxUser
  }

  async execute(ctx: ToolExecutionContext): Promise<ToolResult> {
    const args = (ctx.toolCall.arguments ?? {}) as Record<string, unknown>
    const sessionId = ctx.sessionId
    const profile = ctx.profile

    const target = (args.target as string) || 'memory'
    const action = (args.action as string) || ''
    const content = (args.content as string) ?? null
    const oldText = (args.old_text as string) ?? null

    // ── 验证 target ──
    if (target !== 'memory' && target !== 'user') {
      return ToolResult.sync(this.jsonError(`Invalid target '${target}'. Use 'memory' or 'user'.`))
    }

    try {
      // ── Batch 路径 ──
      const opsNode = args.operations
      if (Array.isArray(opsNode) && opsNode.length > 0) {
        return ToolResult.sync(this.handleBatch(target, opsNode as Array<Record<string, unknown>>, profile, this.maxMemory, this.maxUser))
      }

      // ── 单操作路径 ──
      if (!action) {
        // 未指定 action → 返回当前条目（读取模式）
        const entries = this.memoryStore.readAll(target, profile)
        const maxChars = target === 'user' ? this.maxUser : this.maxMemory
        return ToolResult.sync(this.jsonSuccess(target, 'Current entries.', entries, maxChars))
      }

      switch (action) {
        case 'add':
          return ToolResult.sync(this.handleAdd(target, content, sessionId, profile))
        case 'replace':
          return ToolResult.sync(this.handleReplace(target, oldText, content, sessionId, profile))
        case 'remove':
          return ToolResult.sync(this.handleRemove(target, oldText, sessionId, profile))
        default:
          return ToolResult.sync(this.jsonError(`Unknown action '${action}'. Use: add, replace, remove`))
      }
    } catch {
      return ToolResult.sync(this.consolidationCatch(sessionId, target, profile, () => {
        const entries = this.memoryStore.readAll(target, profile)
        const limit = target === 'user' ? this.maxUser : this.maxMemory
        return this.overflowResponse(target, this.currentChars(entries), limit, entries)
      }))
    }
  }

  // ── 操作处理器 ──

  private handleAdd(target: string, content: string | null, sessionId: string, profile: string): string {
    if (!content || !content.trim()) {
      return this.jsonError("Content is required for 'add' action.")
    }
    content = content.trim()
    const limit = target === 'user' ? this.maxUser : this.maxMemory
    const added = this.memoryStore.addEntry(target, profile, content, limit, 0)
    this.resetConsolidation(sessionId)
    const entries = this.memoryStore.readAll(target, profile)
    const msg = added === 1 ? 'Entry added.' : 'Entry already exists (no duplicate added).'
    return this.jsonSuccess(target, msg, entries, limit)
  }

  private handleReplace(target: string, oldText: string | null, newContent: string | null, sessionId: string, profile: string): string {
    const limit = target === 'user' ? this.maxUser : this.maxMemory
    if (!oldText) {
      return this.missingOldTextError(target, 'replace', profile, limit)
    }
    if (!newContent || !newContent.trim()) {
      return this.jsonError("content is required for 'replace' action.")
    }
    newContent = newContent.trim()

    const result = this.memoryStore.replaceEntry(target, profile, oldText, newContent, limit)
    if (result === -2) {
      // 多匹配
      const entries = this.memoryStore.readAll(target, profile)
      const matched = entries.filter((e) => e.includes(oldText!))
      const previews = matched.map((e) => (e.length > 80 ? e.substring(0, 80) + '...' : e))
      return this.multiMatchResponse(previews)
    }
    if (result === 0) {
      const entries = this.memoryStore.readAll(target, profile)
      return this.noMatchResponse(`No entry matched '${oldText}'.`, entries)
    }
    this.resetConsolidation(sessionId)
    const entries = this.memoryStore.readAll(target, profile)
    return this.jsonSuccess(target, 'Entry replaced.', entries, limit)
  }

  private handleRemove(target: string, oldText: string | null, sessionId: string, profile: string): string {
    const limit = target === 'user' ? this.maxUser : this.maxMemory
    if (!oldText) {
      return this.missingOldTextError(target, 'remove', profile, limit)
    }
    const result = this.memoryStore.removeEntry(target, profile, oldText)
    if (result === -2) {
      const entries = this.memoryStore.readAll(target, profile)
      const matched = entries.filter((e) => e.includes(oldText!))
      const previews = matched.map((e) => (e.length > 80 ? e.substring(0, 80) + '...' : e))
      return this.multiMatchResponse(previews)
    }
    if (result === 0) {
      const entries = this.memoryStore.readAll(target, profile)
      return this.noMatchResponse(`No entry matched '${oldText}'.`, entries)
    }
    this.resetConsolidation(sessionId)
    const entries = this.memoryStore.readAll(target, profile)
    return this.jsonSuccess(target, 'Entry removed.', entries, limit)
  }

  private handleBatch(target: string, opsNode: Array<Record<string, unknown>>, profile: string, maxMemory: number, maxUser: number): string {
    const ops: MemoryOperation[] = opsNode.map((op) => ({
      action: (op.action as MemoryOperation['action']) || '',
      content: (op.content as string) ?? '',
      oldText: (op.old_text as string) ?? '',
    }))
    const limit = target === 'user' ? maxUser : maxMemory
    const result = this.memoryStore.applyBatch(target, profile, ops, limit)
    if (result < 0) {
      return this.jsonError('Batch operation failed. Check current_entries and retry with correct values.')
    }
    const entries = this.memoryStore.readAll(target, profile)
    return this.jsonSuccess(target, `Applied ${ops.length} operation(s).`, entries, limit)
  }

  // ── Consolidation 失败上限控制 ──

  private consolidationCatch(sessionId: string, target: string, profile: string, errorSupplier: () => string): string {
    const current = this.consolidationFailures.get(sessionId) ?? 0
    if (current >= MAX_CONSOLIDATION_FAILURES) {
      return this.jsonTerminal(
        `Memory consolidation failed ${current} times this turn. Stop retrying memory calls — leave memory unchanged for now and continue with your reply to the user. The fact can be saved in a later turn.`
      )
    }
    this.consolidationFailures.set(sessionId, current + 1)
    return errorSupplier()
  }

  private resetConsolidation(sessionId: string): void {
    this.consolidationFailures.delete(sessionId)
  }

  // ── JSON 响应构建器 ──

  private jsonSuccess(target: string, message: string, entries: string[], limit: number): string {
    const current = this.currentChars(entries)
    const pct = limit > 0 ? Math.min(100, Math.floor((current * 100) / limit)) : 0
    return JSON.stringify({
      success: true,
      done: true,
      target,
      usage: `${pct}% — ${current}/${limit} chars`,
      entry_count: entries.length,
      message,
      note: 'Write saved. This update is complete — do not repeat it.',
    })
  }

  private overflowResponse(target: string, current: number, limit: number, entries: string[]): string {
    const resp: Record<string, unknown> = {
      success: false,
      error:
        `${target} at ${current}/${limit} chars. Consolidate now: use 'replace' to merge overlapping entries into shorter ones or 'remove' stale or less important entries (see current_entries below), then retry this add — all in this turn.`,
      usage: `${current}/${limit}`,
    }
    if (entries.length > 0) {
      resp.current_entries = entries
    }
    return JSON.stringify(resp)
  }

  private noMatchResponse(errorMsg: string, entries: string[]): string {
    const resp: Record<string, unknown> = {
      success: false,
      error: errorMsg + ' Check current_entries below and retry with a more specific substring.',
    }
    if (entries.length > 0) {
      resp.current_entries = entries
    }
    return JSON.stringify(resp)
  }

  private multiMatchResponse(previews: string[]): string {
    const resp: Record<string, unknown> = {
      success: false,
      error: 'Multiple entries matched. Be more specific — see matches below.',
    }
    if (previews.length > 0) {
      resp.matches = previews
    }
    return JSON.stringify(resp)
  }

  private jsonTerminal(errorMsg: string): string {
    return JSON.stringify({success: false, done: true, error: errorMsg})
  }

  private missingOldTextError(target: string, action: string, profile: string, maxChars: number): string {
    const entries = this.memoryStore.readAll(target, profile)
    const current = this.currentChars(entries)
    const pct = maxChars > 0 ? Math.min(100, Math.floor((current * 100) / maxChars)) : 0
    const resp: Record<string, unknown> = {
      success: false,
      error:
        `'${action}' needs old_text -- a short unique substring of the entry to ${action}. None was provided. Reissue the ${action} with old_text set to part of one of the current_entries below.`,
      usage: `${pct}% — ${current}/${maxChars} chars`,
    }
    if (entries.length > 0) {
      resp.current_entries = entries
    }
    return JSON.stringify(resp)
  }

  private jsonError(errorMsg: string): string {
    return JSON.stringify({success: false, error: errorMsg})
  }

  private currentChars(entries: string[]): number {
    return entries.length > 0 ? entries.join(MemoryStore.ENTRY_DELIMITER).length : 0
  }
}
