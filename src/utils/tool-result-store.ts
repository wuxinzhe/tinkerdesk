/**
 * tool-result-store.ts — Tool Result 分片存储
 *
 * 基于 IndexedDbStore 的专用子类。
 * 只负责写操作（savePart）和 TTL 清理（cleanup、cleanExpired）。
 * 读操作通过通用 read_indexdb 工具 + IndexedDbStore 完成。
 *
 * Database: ToolResultDB
 *   ObjectStore: parts
 *     keyPath: [toolCallId, partIndex]  // 复合主键
 *     indexes:
 *       - toolCallId  → 用于范围查询（工具类型、会话纬度）
 *       - timestamp   → 用于 TTL 清理
 *
 * 每条记录：
 * {
 *   toolCallId: string,    // 源工具调用的唯一 ID
 *   partIndex: number,     // 从 0 开始的片序号
 *   content: string,       // 该片段的内容（纯文本 / JSON 字符串）
 *   totalParts: number,    // 总分片数（每片都存，方便校验对齐）
 *   timestamp: number      // Date.now() 写入时间
 * }
 */
import { IndexedDbStore } from './indexeddb-store'

const DB_NAME = 'ToolResultDB'
const STORE_NAME = 'parts'
const DB_VERSION = 1

class ToolResultStore extends IndexedDbStore {
  constructor() {
    super(DB_NAME)
  }

  /**
   * 打开数据库（带 Schema 升级逻辑）。
   * 覆盖父类 openDB，确保 parts 存储结构已创建。
   */
  private openDBWithSchema(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: ['toolCallId', 'partIndex']
          })
          store.createIndex('toolCallId', 'toolCallId', { unique: false })
          store.createIndex('timestamp', 'timestamp', { unique: false })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  // ── 写入 ──

  /** 保存一个分片 */
  async savePart(
    toolCallId: string,
    partIndex: number,
    content: string,
    totalParts: number
  ): Promise<void> {
    const db = await this.openDBWithSchema()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put({
        toolCallId,
        partIndex,
        content,
        totalParts,
        timestamp: Date.now()
      })
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    })
  }

  // ── 删除 ──

  /** 删除指定 toolCallId 的所有分片 */
  async cleanup(toolCallId: string): Promise<void> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const index = tx.objectStore(STORE_NAME).index('toolCallId')
      const range = IDBKeyRange.only(toolCallId)
      const request = index.openCursor(range)
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        } else {
          db.close()
          resolve()
        }
      }
      request.onerror = () => { db.close(); reject(request.error) }
    })
  }

  /** 清理超过 maxAgeMs 毫秒的过期分片。返回清理的条数。 */
  async cleanExpired(maxAgeMs = 30 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - maxAgeMs
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const index = tx.objectStore(STORE_NAME).index('timestamp')
      const range = IDBKeyRange.upperBound(cutoff)
      const request = index.openCursor(range)
      let count = 0
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          cursor.delete()
          count++
          cursor.continue()
        } else {
          db.close()
          resolve(count)
        }
      }
      request.onerror = () => { db.close(); reject(request.error) }
    })
  }
}

export const toolResultStore = new ToolResultStore()
