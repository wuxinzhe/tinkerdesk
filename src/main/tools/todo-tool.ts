/**
 * todo-tool.ts — 待办事项工具
 *
 * 复刻 tinker-agent TodoTool：
 * 读取/写入 session 待办列表（全量或合并），Hermes 兼容。
 */
import type { PromptRenderer } from '../core/prompt/renderer'
import type { TodoItem } from '../service/todo-service'
import { TodoService } from '../service/todo-service'
import { BaseTool } from './base-tool'
import { ToolResult } from '../core/tool/tool-result'
import type { ToolContext } from '../core/loop/types'

/** 工具名 */
export const TOOL_NAME = 'builtin_tinker_todo'

/** 最大待办项数 */
const MAX_TODO_ITEMS = 256
/** 单条内容最大字符数 */
const MAX_TODO_CONTENT_CHARS = 4000
/** 截断标记 */
const TRUNCATION_MARKER = '\u2026 [truncated]'
/** 有效状态 */
const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancelled'])

/** 待办工具 */
export class TodoTool extends BaseTool {
  private readonly todoService: TodoService

  constructor(renderer: PromptRenderer, todoService: TodoService) {
    super(renderer, TOOL_NAME)
    this.todoService = todoService
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const args = (ctx.toolCall.arguments ?? {}) as Record<string, unknown>
    const sessionId = ctx.sessionId

    try {
      let items: TodoItem[]
      if (!args.todos) {
        // 读取模式
        items = this.todoService.read(sessionId)
      } else {
        // 写入模式：类型守卫（todos 为字符串时自动 parse；非数组报错）
        let todosNode = args.todos
        if (typeof todosNode === 'string') {
          try {
            todosNode = JSON.parse(todosNode)
          } catch {
            return ToolResult.sync(JSON.stringify({ success: false, error: 'todos must be a list of objects, got unparseable string' }))
          }
        }
        if (!Array.isArray(todosNode)) {
          return ToolResult.sync(JSON.stringify({ success: false, error: `todos must be a list, got ${typeof todosNode}` }))
        }
        const todos = this.parseTodos(todosNode as Array<Record<string, unknown>>)
        const merge = Boolean(args.merge)
        items = this.todoService.write(sessionId, todos, merge)
        // 超 MAX_TODO_ITEMS 砍掉尾部（保留头部）
        if (items.length > MAX_TODO_ITEMS) {
          items = items.slice(0, MAX_TODO_ITEMS)
        }
      }
      return ToolResult.sync(this.buildJsonResponse(items))
    } catch (e) {
      return ToolResult.sync(JSON.stringify({ success: false, error: (e as Error).message }))
    }
  }

  /** 解析 todos（同 id 保留最后一次，位置不变） */
  private parseTodos(arr: Array<Record<string, unknown>>): TodoItem[] {
    const lastIndex = new Map<string, number>()
    const nodes: Array<Record<string, unknown>> = []
    arr.forEach((n, i) => {
      const nid = String(n.id ?? '').trim()
      lastIndex.set(nid || '?', i)
      nodes.push(n)
    })
    const sortedIndices = [...lastIndex.values()].sort((a, b) => a - b)
    const items: TodoItem[] = []
    for (const idx of sortedIndices) {
      const n = nodes[idx]
      let id = String(n.id ?? '').trim()
      if (!id) id = '?'
      let content = String(n.content ?? '').trim()
      if (!content) content = '(no description)'
      else if (content.length > MAX_TODO_CONTENT_CHARS) {
        content = content.substring(0, MAX_TODO_CONTENT_CHARS - TRUNCATION_MARKER.length) + TRUNCATION_MARKER
      }
      let status = String(n.status ?? '').trim().toLowerCase()
      if (!VALID_STATUSES.has(status)) status = 'pending'
      items.push({ id, content, status })
    }
    return items
  }

  /** 构建 Hermes 兼容 JSON 响应：todos + summary */
  private buildJsonResponse(items: TodoItem[]): string {
    const list = items ?? []
    const pending = list.filter((i) => i.status === 'pending').length
    const inProgress = list.filter((i) => i.status === 'in_progress').length
    const completed = list.filter((i) => i.status === 'completed').length
    const cancelled = list.filter((i) => i.status === 'cancelled').length
    return JSON.stringify(
      {
        todos: list,
        summary: { total: list.length, pending, in_progress: inProgress, completed, cancelled },
      },
      null,
      2
    )
  }
}
