/**
 * todo-service.ts — 待办事项服务
 *
 * TodoService（Redis → 文件系统 JSON）：
 * - write：全量替换 或 字段级合并（按 id）
 * - read：读取 session 的待办列表
 * - 持久化：userData/todo/{sessionId}.json（原子写）
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { TodoItem } from './types'

export type { TodoItem } from './types'

/** 有效状态集合 */
const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancelled'])

/** 待办服务 */
export class TodoService {
  private readonly dir: string

  constructor(userDataDir: string) {
    this.dir = join(userDataDir, 'todo')
    mkdirSync(this.dir, { recursive: true })
  }

  /** 读取 session 的待办列表 */
  read(sessionId: string): TodoItem[] {
    try {
      const raw = JSON.parse(readFileSync(this.filePath(sessionId), 'utf-8')) as { items?: TodoItem[] }
      return Array.isArray(raw.items) ? raw.items : []
    } catch {
      return []
    }
  }

  /**
   * 写入待办列表。
   * @param merge false = 全量替换；true = 字段级合并（content/status 非空覆盖，新 id 追加）
   */
  write(sessionId: string, todos: TodoItem[], merge: boolean): TodoItem[] {
    if (!merge) {
      this.writeAll(sessionId, todos)
      return [...todos]
    }
    // 合并模式：字段级合并
    const existingMap = new Map<string, TodoItem>()
    for (const t of this.read(sessionId)) {
      existingMap.set(t.id, t)
    }
    for (const t of todos) {
      const tid = t.id
      if (tid && existingMap.has(tid)) {
        const old = existingMap.get(tid)!
        if (t.content) old.content = t.content
        if (t.status && VALID_STATUSES.has(t.status)) {
          old.status = t.status
        }
      } else if (tid) {
        if (!t.status || !VALID_STATUSES.has(t.status)) {
          t.status = 'pending'
        }
        existingMap.set(tid, t)
      }
    }
    const result = [...existingMap.values()]
    this.writeAll(sessionId, result)
    return result
  }

  private filePath(sessionId: string): string {
    return join(this.dir, `${sessionId}.json`)
  }

  /** 原子写（tmp + rename） */
  private writeAll(sessionId: string, items: TodoItem[]): void {
    const file = this.filePath(sessionId)
    const tmp = file + '.tmp'
    writeFileSync(tmp, JSON.stringify({ items }, null, 2), 'utf-8')
    renameSync(tmp, file)
  }
}
