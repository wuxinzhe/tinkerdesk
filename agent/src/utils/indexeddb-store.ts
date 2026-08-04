/**
 * indexeddb-store.ts — 通用 IndexedDB 存储层
 *
 * 提供只读操作（查询、分页、计数），供 read_indexdb 等共享工具使用。
 * 写操作（savePart 等）在具体的 Store 子类中实现。
 *
 * 分页约定：全系统统一使用 offset/limit 模式。
 *   offset — 起始位置（0-based）
 *   limit  — 返回记录数上限
 *
 * 设计原则：
 * - 读操作不管理 Schema（假设 store 已由写入方创建）
 * - 分页查询基于游标 + count，避免全表加载
 * - 所有方法返回可序列化的纯对象
 *
 * 用法：
 *   import { IndexedDbStore } from '@/utils/indexeddb-store'
 *   const store = new IndexedDbStore('ToolResultDB')
 *   const record = await store.getRecord('parts', ['toolCall_xxx', 0])
 *   const result = await store.queryByIndex({
 *     storeName: 'parts',
 *     indexName: 'toolCallId',
 *     range: IDBKeyRange.only('toolCall_xxx'),
 *     offset: 0,
 *     limit: 5
 *   })
 */

export interface QueryByIndexOptions {
  /** 对象存储名称 */
  storeName: string
  /** 索引名称（必填） */
  indexName: string
  /** IDBKeyRange 查询范围 */
  range: IDBKeyRange
  /** 起始记录偏移，0-based（默认 0） */
  offset?: number
  /** 返回记录数上限（默认 10，最大 50） */
  limit?: number
  /** 排序方向 */
  order?: 'asc' | 'desc'
}

export interface QueryByIndexResult {
  /** 当前页记录列表 */
  records: Record<string, unknown>[]
  /** 符合条件的总记录数 */
  total: number
  /** 本次查询的起始偏移 */
  offset: number
  /** 本次查询的返回数上限 */
  limit: number
  /** 是否有更多记录（offset + limit < total） */
  hasMore: boolean
}

export class IndexedDbStore {
  constructor(protected dbName: string) {}

  /**
   * 只读方式打开数据库（不触发 onupgradeneeded）。
   * 子类可覆盖此方法以管理 Schema。
   */
  protected openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  // ── 工具方法 ──

  /** 列出数据库中所有 Object Store 名称 */
  async listStores(): Promise<string[]> {
    const db = await this.openDB()
    const names = Array.from(db.objectStoreNames)
    db.close()
    return names
  }

  // ── 读取方法 ──

  /**
   * 按主键查询单条记录。
   *
   * @param storeName  对象存储名称
   * @param key        主键值（单值或复合主键数组，如 ['toolCallId', 0]）
   * @returns          记录对象，未找到返回 null
   */
  async getRecord(storeName: string, key: IDBValidKey): Promise<Record<string, unknown> | null> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const request = tx.objectStore(storeName).get(key)
      request.onsuccess = () => {
        db.close()
        resolve(request.result ? this._serialize(request.result) : null)
      }
      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  }

  /**
   * 按索引分页查询，返回 offset/limit 分页结构。
   *
   * 流程：先 count 总数 → 游标翻到目标偏移位置 → 读取 limit 条。
   * 使用 cursor.continue() 跳过前面的记录，避免全表加载。
   */
  async queryByIndex(opts: QueryByIndexOptions): Promise<QueryByIndexResult> {
    const { storeName, indexName, range, order = 'asc' } = opts
    const offset = Math.max(0, Math.floor(opts.offset ?? 0))
    const limit = Math.min(50, Math.max(1, Math.floor(opts.limit ?? 10)))

    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)

      // 根据有无 indexName 决定查询源
      let source: IDBIndex | IDBObjectStore
      try {
        source = indexName ? store.index(indexName) : store
      } catch {
        db.close()
        reject(new Error(`索引 "${indexName}" 在 "${storeName}" 中不存在`))
        return
      }

      // 第一步：count 总数
      const countReq = source.count(range)
      countReq.onsuccess = () => {
        const total = countReq.result
        const hasMore = offset + limit < total

        // 第二步：游标翻到目标偏移
        const direction = order === 'desc' ? 'prev' : 'next'
        const cursorReq = source.openCursor(range, direction)
        const records: Record<string, unknown>[] = []
        let skipped = 0

        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result
          if (!cursor || records.length >= limit) {
            db.close()
            resolve({ records, total, offset, limit, hasMore })
            return
          }

          if (skipped < offset) {
            skipped++
            cursor.continue()
          } else {
            records.push(this._serialize(cursor.value))
            cursor.continue()
          }
        }

        cursorReq.onerror = () => {
          db.close()
          reject(cursorReq.error)
        }
      }

      countReq.onerror = () => {
        db.close()
        reject(countReq.error)
      }
    })
  }

  /**
   * 按索引计数。
   *
   * @param storeName  对象存储名称
   * @param indexName  索引名称
   * @param range      IDBKeyRange 查询范围
   * @returns          符合条件的记录总数
   */
  async count(
    storeName: string,
    indexName: string,
    range: IDBKeyRange
  ): Promise<number> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      let source: IDBIndex | IDBObjectStore
      try {
        source = tx.objectStore(storeName).index(indexName)
      } catch {
        db.close()
        reject(new Error(`索引 "${indexName}" 在 "${storeName}" 中不存在`))
        return
      }
      const request = source.count(range)
      request.onsuccess = () => {
        db.close()
        resolve(request.result)
      }
      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  }

  // ── 内部辅助 ──

  /**
   * 将 IDB 返回的对象序列化为纯 JS 对象。
   * IDB 可能返回 DOM 对象或包含不可序列化的字段（如函数、Buffer），
   * 此处做安全清洗。
   */
  protected _serialize(val: unknown): Record<string, unknown> {
    if (val === null || val === undefined) return {}
    if (typeof val !== 'object') return { value: val }
    if (Array.isArray(val)) return { value: val }

    const obj = val as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(obj)) {
      const v = obj[key]
      // 跳过函数、symbol、undefined
      if (v === undefined || typeof v === 'function' || typeof v === 'symbol') continue
      // 跳过 Blob、File 等大型二进制对象（返回类型名称即可）
      if (v instanceof Blob) {
        result[key] = `[Blob: ${v.type}, ${v.size} bytes]`
        continue
      }
      if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
        result[key] = `[ArrayBuffer: ${(v as ArrayBuffer).byteLength || (v as ArrayBufferView).byteLength} bytes]`
        continue
      }
      result[key] = v
    }
    return result
  }
}
