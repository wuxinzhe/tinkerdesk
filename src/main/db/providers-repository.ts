import {getDatabase} from './database';
import {ProviderEntity, ProviderRow, PROVIDER_STRING_COLS, PROVIDER_NUMBER_COLS} from './types';

/**
 * 运行时校验 providers 数据库行（与 custom-model-repository 相同的强类型模式）
 */
function toRow(value: unknown): ProviderRow {
  if (typeof value !== 'object' || value === null) {
    throw new Error('查询结果不是对象行')
  }
  const r = value as Record<string, unknown>
  for (const col of PROVIDER_STRING_COLS) {
    if (typeof r[col] !== 'string') {
      throw new Error(`providers 列 ${col} 类型错误: 期望 string, 得到 ${typeof r[col]}`)
    }
  }
  for (const col of PROVIDER_NUMBER_COLS) {
    if (typeof r[col] !== 'number') {
      throw new Error(`providers 列 ${col} 类型错误: 期望 number, 得到 ${typeof r[col]}`)
    }
  }
  return {
    id: r.id as string,
    name: r.name as string,
    base_url: r.base_url as string,
    api_mode: r.api_mode as string,
    description: r.description as string,
    sort_order: r.sort_order as number,
    created_at: r.created_at as string,
  }
}

function rowToEntity(row: ProviderRow): ProviderEntity {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiMode: row.api_mode === 'anthropic' ? 'anthropic' : 'openai',
    description: row.description,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  }
}

const SELECT_COLS = 'id, name, base_url, api_mode, description, sort_order, created_at'

/** 预置供应商数据访问层（providers 表） */
export const ProviderRepository = {
  /** 查询全部供应商（按 sort_order 排序） */
  listAll(): ProviderEntity[] {
    const db = getDatabase()
    const rows = db
      .prepare(`SELECT ${SELECT_COLS} FROM providers ORDER BY sort_order, id`)
      .all()
    return rows.map((r) => rowToEntity(toRow(r)))
  },

  /** 按 id 查询 */
  findById(id: string): ProviderEntity | null {
    const db = getDatabase()
    const row = db.prepare(`SELECT ${SELECT_COLS} FROM providers WHERE id = ?`).get(id)
    return row ? rowToEntity(toRow(row)) : null
  },

  /** 查询启用某 apiMode 的供应商 */
  listByMode(apiMode: 'openai' | 'anthropic'): ProviderEntity[] {
    const db = getDatabase()
    const rows = db
      .prepare(`SELECT ${SELECT_COLS} FROM providers WHERE api_mode = ? ORDER BY sort_order, id`)
      .all(apiMode)
    return rows.map((r) => rowToEntity(toRow(r)))
  },
}
