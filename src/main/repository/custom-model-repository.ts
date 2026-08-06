import { randomUUID } from 'crypto';
import { getDatabase } from './database';
import {
  CreateCustomModelInput,
  CUSTOM_MODEL_BOOLEAN_COLS,
  CUSTOM_MODEL_NUMBER_COLS,
  CUSTOM_MODEL_STRING_COLS,
  CustomModelEntity,
  CustomModelRow,
  UpdateCustomModelInput,
} from './types';

/**
 * 运行时校验数据库行（强类型转换，替代 as unknown as）。
 * node:sqlite 的 all()/get() 返回 Record<string, SQLOutputValue>，
 * 这里逐列校验类型并构造 Row，缺失/类型错误立即抛出，避免脏数据流入实体。
 */
function toRow(value: unknown): CustomModelRow {
  if (typeof value !== 'object' || value === null) {
    throw new Error('查询结果不是对象行')
  }
  const r = value as Record<string, unknown>
  for (const col of CUSTOM_MODEL_STRING_COLS) {
    if (typeof r[col] !== 'string') {
      throw new Error(`custom_models 列 ${col} 类型错误: 期望 string, 得到 ${typeof r[col]}`)
    }
  }
  for (const col of CUSTOM_MODEL_NUMBER_COLS) {
    if (typeof r[col] !== 'number') {
      throw new Error(`custom_models 列 ${col} 类型错误: 期望 number, 得到 ${typeof r[col]}`)
    }
  }
  for (const col of CUSTOM_MODEL_BOOLEAN_COLS) {
    if (typeof r[col] !== 'number') {
      throw new Error(`custom_models 列 ${col} 类型错误: 期望 0/1, 得到 ${typeof r[col]}`)
    }
  }
  // 校验通过后逐字段构造（不用 as Row 断言，消除 Record → Row 转换错误）
  return {
    id: r.id as string,
    profile: r.profile as string,
    alias: r.alias as string,
    model_name: r.model_name as string,
    provider_id: r.provider_id as string,
    api_key: r.api_key as string,
    base_url: r.base_url as string,
    context_limit: r.context_limit as number,
    model_type: r.model_type as string,
    enabled: r.enabled as number,
    test_passed: r.test_passed as number,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }
}

function rowToEntity(row: CustomModelRow): CustomModelEntity {
  return {
    id: row.id,
    profile: row.profile,
    alias: row.alias,
    modelName: row.model_name,
    providerId: row.provider_id,
    apiKey: row.api_key,
    baseUrl: row.base_url,
    contextLimit: row.context_limit,
    modelType: row.model_type,
    enabled: row.enabled === 1,
    testPassed: row.test_passed === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const SELECT_COLS =
  'id, profile, alias, model_name, provider_id, api_key, base_url, context_limit, model_type, enabled, test_passed, created_at, updated_at'

/** 自定义模型数据访问层（本地 SQLite） */
export const CustomModelRepository = {
  /** 查询启用的模型（按创建时间倒序） */
  listEnabled(profile: string): CustomModelEntity[] {
    const db = getDatabase()
    const rows = db
      .prepare(`SELECT ${SELECT_COLS} FROM custom_models WHERE profile = ? AND enabled = 1 ORDER BY created_at DESC`)
      .all(profile)
    return rows.map((r) => rowToEntity(toRow(r)))
  },

  /** 按 id 查询 */
  findById(id: string, profile: string): CustomModelEntity | null {
    const db = getDatabase()
    const row = db
      .prepare(`SELECT ${SELECT_COLS} FROM custom_models WHERE profile = ? AND id = ? AND enabled = 1`)
      .get(profile, id)
    return row ? rowToEntity(toRow(row)) : null
  },

  /** 创建 */
  create(input: CreateCustomModelInput): CustomModelEntity {
    const db = getDatabase()
    const entity: CustomModelEntity = {
      id: randomUUID(),
      profile: input.profile ?? 'default',
      alias: input.alias,
      modelName: input.modelName,
      providerId: input.providerId ?? 'openai',
      apiKey: input.apiKey ?? '',
      baseUrl: input.baseUrl ?? '',
      contextLimit: input.contextLimit ?? 128000,
      modelType: input.modelType ?? 'chat',
      enabled: true,
      testPassed: false,
      createdAt: '',
      updatedAt: '',
    }
    db.prepare(
      `INSERT INTO custom_models
        (id, profile, alias, model_name, provider_id, api_key, base_url, context_limit, model_type, enabled, test_passed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entity.id, entity.profile, entity.alias, entity.modelName, entity.providerId,
      entity.apiKey, entity.baseUrl, entity.contextLimit, entity.modelType,
      entity.enabled ? 1 : 0, entity.testPassed ? 1 : 0,
    )
    return this.findById(entity.id, entity.profile)!
  },

  /** 更新（COALESCE 语义：仅更新非空字段，updated_at 自动刷新） */
  update(id: string, input: UpdateCustomModelInput, profile: string): boolean {
    const db = getDatabase()
    const result = db.prepare(
      `UPDATE custom_models SET
        updated_at = datetime('now'),
        alias      = COALESCE(?, alias),
        model_name = COALESCE(?, model_name),
        provider_id = COALESCE(?, provider_id),
        api_key    = COALESCE(?, api_key),
        base_url   = COALESCE(?, base_url),
        context_limit = COALESCE(?, context_limit)
       WHERE profile = ? AND id = ?`
    ).run(
      input.alias ?? null, input.modelName ?? null, input.providerId ?? null,
      input.apiKey ?? null, input.baseUrl ?? null, input.contextLimit ?? null,
      profile, id,
    )
    return result.changes > 0
  },

  /** 删除 */
  delete(id: string, profile: string): boolean {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM custom_models WHERE profile = ? AND id = ?').run(profile, id)
    return result.changes > 0
  },

  /** 更新连通性测试结果 */
  updateTestPassed(id: string, passed: boolean, profile: string): boolean {
    const db = getDatabase()
    const result = db
      .prepare(`UPDATE custom_models SET test_passed = ?, updated_at = datetime('now') WHERE profile = ? AND id = ?`)
      .run(passed ? 1 : 0, profile, id)
    return result.changes > 0
  },
}
