/**
 * read-indexdb.ts — 双端共享工具：通用 IndexedDB 读取器
 *
 * toolType: 'shared' — 同时可用在 Web 端和 Desktop 端。
 * 不依赖 Electron API，纯浏览器 IndexedDB 操作。
 *
 * 所有分页使用 offset/limit 模式（全系统统一约定）：
 *   offset — 起始位置，0-based
 *   limit  — 返回记录数上限
 *
 * 功能：
 *   - get:        按主键查单条记录
 *   - query:      按索引查询，支持 offset/limit 分页 + 排序
 *   - count:      按索引计数
 *   - listStores: 列出数据库中的所有 Object Store
 *
 * 数据库约定：
 *   - 默认读取 ToolResultDB（工具结果分片存储）
 *   - 可通过 dbName 参数指定其他数据库
 *   - 只读，不修改任何数据
 *   - 写入方负责创建 Object Store 和索引
 *
 * 注册方式（app-init.ts）：
 *   import { readIndexDbTool } from '@/tools/shared/read-indexdb'
 *   toolRegistry.registerSharedTool(readIndexDbTool)
 */
import { BaseTool } from '@/defines/tools/base-tool'
import type { ToolSchema, ToolResult, ToolExecutionContext } from '@/defines/tools/base-tool'
import { IndexedDbStore } from '@/utils/indexeddb-store'

// ── 类型定义 ──

type ReadMethod = 'get' | 'query' | 'count' | 'listStores'

interface ReadIndexDbParams {
  method: ReadMethod
  dbName?: string
  storeName?: string
  key?: string
  indexName?: string
  keyValue?: string
  offset?: number
  limit?: number
  order?: 'asc' | 'desc'
}

// ── 工具类 ──

class ReadIndexDbTool extends BaseTool<ReadIndexDbParams> {
  readonly id = 'read_indexdb'
  readonly name = 'read_indexdb'
  readonly description = '通用 IndexedDB 只读工具 —— 当工具结果过大（超过 100KB）时，'
    + '会被自动分割为多个 60KB 的分片存入 IndexedDB 的 ToolResultDB.parts 表，'
    + 'LLM 必须通过此工具逐片读取。'
    + '支持的方法：query（按 indexName+keyValue 查询 + offset/limit 翻页）、'
    + 'get（按主键查单条）、count（计数）、listStores（列出数据表）。'
    + '从 offset=0 开始逐页读取，直到 hasMore=false 表示全部读完。'
  readonly category = '内置工具'
  readonly toolType = 'shared'

  getSchema(): ToolSchema {
    return {
      type: 'function',
      function: {
        name: this.id,
        description: this.description,
        parameters: {
          type: 'object',
          required: ['method'],
          properties: {
            method: {
              type: 'string',
              enum: ['get', 'query', 'count', 'listStores'],
              description: '操作类型：\n'
                + '- get: 按主键查单条记录，需传 storeName + key\n'
                + '- query: 按索引查询 + offset/limit 分页，需传 storeName + indexName + keyValue，'
                + '可选 offset/limit/order\n'
                + '- count: 按索引计数，需传 storeName + indexName + keyValue\n'
                + '- listStores: 列出数据库中的所有数据表'
            },
            dbName: {
              type: 'string',
              description: '数据库名称（默认 "ToolResultDB"）。'
                + '常见库：ToolResultDB（工具结果分片存储）'
            },
            storeName: {
              type: 'string',
              description: 'Object Store 名称（数据表名）。'
                + '例如 parts 表（keyPath 为 [toolCallId, partIndex]，索引有 toolCallId 和 timestamp）。'
                + 'method=listStores 时不需要此参数。'
            },
            // ---- get 方法参数 ----
            key: {
              type: 'string',
              description: '主键值。单值主键直接传字符串（如 "call_xxx"）；'
                + '复合主键传 JSON 数组字符串（如 \'["call_xxx", 0]\' 表示 toolCallId=call_xxx, partIndex=0）。'
                + '仅 method=get 时使用。'
            },
            // ---- query / count 方法参数 ----
            indexName: {
              type: 'string',
              description: '索引名称。需与数据库中定义的索引名一致。'
                + '例如 parts 表有索引 "toolCallId" 和 "timestamp"。'
                + '仅 method=query 或 count 时使用。'
            },
            keyValue: {
              type: 'string',
              description: '索引查询值。构造为 IDBKeyRange.only(keyValue) 进行精确匹配。'
                + '例如查询 toolCallId="call_xxx" 的所有分片。'
                + '仅 method=query 或 count 时使用。'
            },
            // ---- query 分页参数（offset/limit 模式） ----
            offset: {
              type: 'integer',
              description: '起始记录偏移，0-based（默认 0）。'
                + '例如已读了 5 条，传 offset=5 读取后续记录。'
                + '仅 method=query 时使用。',
              default: 0,
              minimum: 0
            },
            limit: {
              type: 'integer',
              description: '返回记录数上限（默认 10，最大 50）。'
                + '仅 method=query 时使用。',
              default: 10,
              maximum: 50,
              minimum: 1
            },
            order: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: '排序方向（默认 "asc"）。仅 method=query 时使用。'
            }
          }
        }
      },
      toolType: this.toolType,
      emoji: '🗄️'
    }
  }

  async execute(
    params: ReadIndexDbParams,
    context?: ToolExecutionContext
  ): Promise<ToolResult | void> {
    const {
      method,
      dbName = 'ToolResultDB',
      storeName,
      key,
      indexName,
      keyValue,
      offset,
      limit,
      order
    } = params

    const store = new IndexedDbStore(dbName)

    try {
      let payload: string

      switch (method) {
        // ── listStores ──
        case 'listStores': {
          const stores = await store.listStores()
          payload = JSON.stringify({ dbName, stores }, null, 2)
          break
        }

        // ── get ──
        case 'get': {
          if (!storeName) {
            payload = JSON.stringify({ error: 'method=get 需要 storeName 参数' })
            break
          }
          if (!key) {
            payload = JSON.stringify({ error: 'method=get 需要 key 参数' })
            break
          }

          // 解析复合主键（支持 JSON 数组字符串）
          let parsedKey: IDBValidKey
          try {
            const parsed = JSON.parse(key)
            parsedKey = Array.isArray(parsed) ? parsed : key
          } catch {
            // 不是 JSON，当作字符串主键
            parsedKey = key
          }

          const record = await store.getRecord(storeName, parsedKey)
          payload = JSON.stringify({ found: record !== null, record }, null, 2)
          break
        }

        // ── query ──
        case 'query': {
          if (!storeName) {
            payload = JSON.stringify({ error: 'method=query 需要 storeName 参数' })
            break
          }
          if (!indexName) {
            payload = JSON.stringify({ error: 'method=query 需要 indexName 参数' })
            break
          }
          if (keyValue === undefined || keyValue === null) {
            payload = JSON.stringify({ error: 'method=query 需要 keyValue 参数' })
            break
          }

          const range = IDBKeyRange.only(keyValue)
          const result = await store.queryByIndex({
            storeName,
            indexName,
            range,
            offset: offset ?? 0,
            limit: limit ?? 10,
            order: order ?? 'asc'
          })

          payload = JSON.stringify(result, null, 2)
          break
        }

        // ── count ──
        case 'count': {
          if (!storeName) {
            payload = JSON.stringify({ error: 'method=count 需要 storeName 参数' })
            break
          }
          if (!indexName) {
            payload = JSON.stringify({ error: 'method=count 需要 indexName 参数' })
            break
          }
          if (keyValue === undefined || keyValue === null) {
            payload = JSON.stringify({ error: 'method=count 需要 keyValue 参数' })
            break
          }

          const range = IDBKeyRange.only(keyValue)
          const total = await store.count(storeName, indexName, range)
          payload = JSON.stringify({
            storeName,
            indexName,
            keyValue,
            total
          }, null, 2)
          break
        }

        default:
          payload = JSON.stringify({
            error: `未知 method: "${method}"，支持: get、query、count、listStores`
          })
      }

      if (context) {
        context.sendToolResult(context.toolCallId, payload)
      } else {
        return { result: payload }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      const payload = JSON.stringify({
        error: `IndexedDB 操作失败: ${errorMsg}`,
        dbName,
        method
      })
      if (context) {
        context.sendToolResult(context.toolCallId, payload)
      } else {
        return { result: payload }
      }
    }
  }
}

export const readIndexDbTool = new ReadIndexDbTool()
