/**
 * memory-store.ts — 文件系统记忆存储
 *
 * 复刻 tinker-agent MemoryStore（Redis → 文件系统 JSON）：
 * 本地客户端无 Redis，用 userData/memory/{profile}.json 持久化。
 * 原子写（tmp + rename）保证崩溃安全，等价 Redis Lua 的原子性。
 *
 * 数据格式：{ "entries": string[] }，按 profile 分区。
 * 操作语义版：
 *   addEntry     1 已添加 / 0 重复 / -1 超限
 *   replaceEntry 1 已替换 / 0 未找到 / -1 超限 / -2 多条匹配
 *   removeEntry  1 已删除 / 0 未找到 / -2 多条匹配
 *   applyBatch   >0 成功条目数 / -N 操作 N 未找到 / -(100+N) 多条匹配 / -200 超限
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { MemoryOperation } from './types'

export type { MemoryOperation } from './types'

/** 文件系统记忆存储 */
export class MemoryStore {
  /** Entry 分隔符 */
  static readonly ENTRY_DELIMITER = '\n§\n'

  /** 记忆类型 target：'memory' 或 'user' */
  static readonly TARGET_MEMORY = 'memory'
  static readonly TARGET_USER = 'user'

  /** 存储根目录（app userData/memory） */
  private readonly dir: string

  constructor(userDataDir: string) {
    this.dir = join(userDataDir, 'memory')
    mkdirSync(this.dir, { recursive: true })
  }

  // ── Public API ──

  /** 读取全部条目（无数据返回空数组） */
  readAll(target: string, profile: string): string[] {
    try {
      const file = this.filePath(target, profile)
      const raw = JSON.parse(readFileSync(file, 'utf-8')) as { entries?: string[] }
      return Array.isArray(raw.entries) ? raw.entries : []
    } catch {
      return []
    }
  }

  /**
   * 原子添加一条 entry。
   * @return 1 已添加，0 重复（跳过），-1 超出限制
   */
  addEntry(target: string, profile: string, content: string, charLimit: number, maxEntries: number): number {
    const items = this.readAll(target, profile)
    // 去重
    if (items.includes(content)) {
      return 0
    }
    // 字符限制
    if (this.totalChars(items) + content.length > charLimit) {
      return -1
    }
    // 条目数限制
    if (maxEntries > 0 && items.length >= maxEntries) {
      return -1
    }
    items.push(content)
    this.writeAll(target, profile, items)
    return 1
  }

  /**
   * 原子替换匹配子串的 entry。
   * @return 1 已替换，0 未找到，-1 超出限制，-2 多条匹配且值不同
   */
  replaceEntry(target: string, profile: string, oldText: string, newContent: string, charLimit: number): number {
    const items = this.readAll(target, profile)
    const { matchIdx, distinctVals } = this.findMatches(items, oldText)
    if (matchIdx === -1) {
      return 0
    }
    if (distinctVals.size > 1) {
      return -2
    }
    const total = this.totalChars(items) - items[matchIdx].length + newContent.length
    if (total > charLimit) {
      return -1
    }
    items[matchIdx] = newContent
    this.writeAll(target, profile, items)
    return 1
  }

  /**
   * 原子删除匹配子串的 entry。
   * @return 1 已删除，0 未找到，-2 多条匹配且值不同
   */
  removeEntry(target: string, profile: string, oldText: string): number {
    const items = this.readAll(target, profile)
    const { matchIdx, distinctVals } = this.findMatches(items, oldText)
    if (matchIdx === -1) {
      return 0
    }
    if (distinctVals.size > 1) {
      return -2
    }
    items.splice(matchIdx, 1)
    this.writeAll(target, profile, items)
    return 1
  }

  /**
   * 原子批量执行操作序列（all-or-nothing）。
   * @return >0 成功（写入后的条目数），-N 操作 N 未找到，
   *         -(100+N) 操作 N 多条匹配，-200 超出字符限制
   */
  applyBatch(target: string, profile: string, operations: MemoryOperation[], charLimit: number): number {
    const items = this.readAll(target, profile)
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i]
      const idx = i + 1
      if (op.action === 'add') {
        if (!items.includes(op.content)) {
          items.push(op.content)
        }
      } else if (op.action === 'replace') {
        const { matchIdx, distinctVals } = this.findMatches(items, op.oldText)
        if (matchIdx === -1) {
          return -idx
        }
        if (distinctVals.size > 1) {
          return -(100 + idx)
        }
        items[matchIdx] = op.content
      } else if (op.action === 'remove') {
        const { matchIdx, distinctVals } = this.findMatches(items, op.oldText)
        if (matchIdx === -1) {
          return -idx
        }
        if (distinctVals.size > 1) {
          return -(100 + idx)
        }
        items.splice(matchIdx, 1)
      } else {
        return -(300 + idx) // 未知操作
      }
    }
    // 最终字符预算检查
    if (this.totalChars(items) > charLimit) {
      return -200
    }
    this.writeAll(target, profile, items)
    return items.length
  }

  /** 按索引替换条目（index 越界返回 -1；内容超限返回 -2） */
  updateByIndex(target: string, profile: string, index: number, newContent: string, charLimit: number): number {
    const items = this.readAll(target, profile)
    if (index < 0 || index >= items.length) return -1
    if (newContent.length > charLimit) return -2
    items[index] = newContent
    this.writeAll(target, profile, items)
    return 1
  }

  /** 按索引删除条目（index 越界返回 -1） */
  removeByIndex(target: string, profile: string, index: number): number {
    const items = this.readAll(target, profile)
    if (index < 0 || index >= items.length) return -1
    items.splice(index, 1)
    this.writeAll(target, profile, items)
    return 1
  }

  /** 按新顺序重排条目（order 长度必须等于条目数） */
  reorder(target: string, profile: string, order: string[]): number {
    const items = this.readAll(target, profile)
    if (order.length !== items.length) return -1
    this.writeAll(target, profile, [...order])
    return 1
  }

  // ── Internal ──

  /** 文件路径：{dir}/{target}-{profile}.json */
  private filePath(target: string, profile: string): string {
    return join(this.dir, `${target}-${profile}.json`)
  }

  /** 原子写：写 tmp 再 rename（崩溃安全） */
  private writeAll(target: string, profile: string, items: string[]): void {
    const file = this.filePath(target, profile)
    const tmp = file + '.tmp'
    writeFileSync(tmp, JSON.stringify({ entries: items }, null, 2), 'utf-8')
    renameSync(tmp, file)
  }

  /** 计算条目总字符数 */
  private totalChars(items: string[]): number {
    return items.reduce((sum, v) => sum + v.length + MemoryStore.ENTRY_DELIMITER.length, 0)
  }

  /** 查找匹配子串的条目：返回 {matchIdx, distinctVals} */
  private findMatches(items: string[], oldText: string): { matchIdx: number; distinctVals: Set<string> } {
    let matchIdx = -1
    const distinctVals = new Set<string>()
    for (let i = 0; i < items.length; i++) {
      if (items[i].includes(oldText)) {
        if (matchIdx === -1) {
          matchIdx = i
        }
        distinctVals.add(items[i])
      }
    }
    return { matchIdx, distinctVals }
  }
}
