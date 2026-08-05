/**
 * session-search-tool.ts — 会话搜索工具
 *
 * 复刻 showing-agent SessionSearchTool：
 * 4 种查询模式：DISCOVER（搜索）/ SCROLL（滚动窗口）/ READ（整场读取）/ BROWSE（浏览最近）。
 */
import type {PromptRenderer} from '../prompt/renderer'
import {BaseTool} from './base-tool'
import type {ToolExecutionContext} from './types'
import {ToolResult} from './tool-result'
import type {SessionService} from '../service/session-service'

/** 工具名 */
export const TOOL_NAME = 'server_showing_session_search'

/** 会话搜索工具 */
export class SessionSearchTool extends BaseTool {
  private readonly sessionService: SessionService

  constructor(renderer: PromptRenderer, sessionService: SessionService) {
    super(renderer, TOOL_NAME)
    this.sessionService = sessionService
  }

  async execute(ctx: ToolExecutionContext): Promise<ToolResult> {
    const args = (ctx.toolCall.arguments ?? {}) as Record<string, unknown>
    const profile = ctx.profile

    try {
      const mode = this.resolveMode(args)
      let result: string
      switch (mode) {
        case 'DISCOVER':
          result = this.doDiscover(args, profile)
          break
        case 'SCROLL':
          result = this.doScroll(args, ctx, profile)
          break
        case 'READ':
          result = this.doRead(args, ctx, profile)
          break
        default:
          result = this.doBrowse(ctx, profile)
      }
      return ToolResult.sync(result)
    } catch (e) {
      return ToolResult.sync(`Error: Search failed: ${(e as Error).message}`)
    }
  }

  /** 推断查询模式 */
  private resolveMode(args: Record<string, unknown>): 'DISCOVER' | 'SCROLL' | 'READ' | 'BROWSE' {
    if (args.query && String(args.query).trim()) return 'DISCOVER'
    if (args.session_id && args.around_message_id) return 'SCROLL'
    if (args.session_id) return 'READ'
    return 'BROWSE'
  }

  /** 解析 session_id（支持 profile/session_id 格式） */
  private resolveSessionId(args: Record<string, unknown>): string {
    const raw = String(args.session_id ?? '')
    if (raw.includes('/')) {
      const parts = raw.split('/', 2)
      if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
        return parts[1]
      }
    }
    return raw
  }

  /** DISCOVER：全文搜索（标题 LIKE） */
  private doDiscover(args: Record<string, unknown>, profile: string): string {
    const query = String(args.query ?? '').trim()
    const limit = typeof args.limit === 'number' ? args.limit : 3

    // 1) 标题匹配优先
    const titleHit = this.sessionService.matchSessionTitle(query, profile)

    // 2) 标题 LIKE 搜索
    const hits = this.sessionService.discoverHits(query, limit, null, null, profile)

    const results: Array<Record<string, unknown>> = []
    if (titleHit) {
      results.push({sessionId: titleHit.sessionId, title: titleHit.title, source: '', when: '', matchedRole: '', matchMessageId: 0, snippet: ''})
    }
    let slot = 0
    for (const hit of hits) {
      if (slot >= limit) break
      if (titleHit && titleHit.sessionId === hit.sessionId) continue
      results.push({sessionId: hit.sessionId, title: hit.title, source: '', when: '', matchedRole: '', matchMessageId: 0, snippet: hit.snippet})
      slot++
    }
    return JSON.stringify({success: true, mode: 'discover', query, results, count: results.length})
  }

  /** SCROLL：消息窗口滚动 */
  private doScroll(args: Record<string, unknown>, ctx: ToolExecutionContext, profile: string): string {
    const sessionId = this.resolveSessionId(args)
    const aroundId = Number(args.around_message_id ?? 0)
    const window = typeof args.window === 'number' ? args.window : 5

    // 排除当前活跃 session
    const currentRoot = this.sessionService.resolveLineage(ctx.sessionId, profile)
    const targetRoot = this.sessionService.resolveLineage(sessionId, profile)
    if (currentRoot === targetRoot && currentRoot === sessionId) {
      return 'Error: scroll rejected: anchor lives in the current session lineage (already in your active context).'
    }

    let sr = this.sessionService.scrollWithCounts(sessionId, aroundId, window, profile)
    if (sr.window.length === 0) {
      sr = this.sessionService.scrollRebind(sessionId, aroundId, window, profile)
    }
    return JSON.stringify({
      success: true,
      mode: 'scroll',
      sessionId,
      aroundMessageId: aroundId,
      window,
      messages: sr.window,
      messagesBefore: sr.messagesBefore,
      messagesAfter: sr.messagesAfter,
    })
  }

  /** READ：整场会话读取 */
  private doRead(args: Record<string, unknown>, ctx: ToolExecutionContext, profile: string): string {
    const sessionId = this.resolveSessionId(args)
    if (sessionId === ctx.sessionId) {
      return 'Error: Cannot read current session (already in your active context). Use scroll with around_message_id to inspect recent messages.'
    }
    const rr = this.sessionService.readSession(sessionId, 20, 10, profile)
    if (!rr) {
      return `Error: session_id not found: ${sessionId}`
    }
    const resp: Record<string, unknown> = {
      success: true,
      mode: 'read',
      sessionId: rr.sessionId,
      sessionMeta: {when: '', source: '', title: rr.title},
      messageCount: rr.messageCount,
      truncated: rr.truncated,
      messages: rr.messages,
    }
    if (rr.truncated) {
      resp.message = `Session has ${rr.messageCount} messages; showing first 20 + last 10. Pass around_message_id (any id above) to scroll the middle.`
    }
    return JSON.stringify(resp)
  }

  /** BROWSE：最近会话浏览 */
  private doBrowse(ctx: ToolExecutionContext, profile: string): string {
    const sessions = this.sessionService.browseRich(20, ctx.sessionId, profile)
    const results = sessions.map((s) => ({
      sessionId: s.sessionId,
      title: s.title || '(untitled)',
      preview: s.preview || '',
    }))
    return JSON.stringify({
      success: true,
      mode: 'browse',
      results,
      count: results.length,
      message: `Showing ${results.length} most recent sessions. Pass query= to search, or session_id+around_message_id to scroll.`,
    })
  }
}
