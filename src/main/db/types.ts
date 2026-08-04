/**
 * types.ts — src/main/db 包统一类型定义
 *
 * 集中存放 db 包下所有表实体、入参、数据库行、列清单类型。
 * Repository / IPC / 上层服务统一从这里 import，避免散落各处。
 */

// ── custom_models 表 ──────────────────────────────────────────────

/** 自定义模型实体（对应 custom_models 表，参考 showing-agent UserCustomModelEntity 去掉 user_id） */
export interface CustomModelEntity {
  id: string
  profile: string
  alias: string
  modelName: string
  providerId: string
  apiKey: string
  baseUrl: string
  contextLimit: number
  modelType: string
  enabled: boolean
  testPassed: boolean
  createdAt: string
  updatedAt: string
}

/** 创建自定义模型参数 */
export interface CreateCustomModelInput {
  alias: string
  modelName: string
  providerId?: string
  apiKey?: string
  baseUrl?: string
  contextLimit?: number
  modelType?: string
  profile?: string
}

/** 更新自定义模型参数（仅更新非空字段） */
export interface UpdateCustomModelInput {
  alias?: string
  modelName?: string
  providerId?: string
  apiKey?: string
  baseUrl?: string
  contextLimit?: number
}

/** custom_models 数据库行（snake_case 列名，node:sqlite 原始返回） */
export interface CustomModelRow {
  id: string
  profile: string
  alias: string
  model_name: string
  provider_id: string
  api_key: string
  base_url: string
  context_limit: number
  model_type: string
  enabled: number
  test_passed: number
  created_at: string
  updated_at: string
}

/** custom_models 字符串列清单（toRow 校验用） */
export const CUSTOM_MODEL_STRING_COLS = ['id', 'profile', 'alias', 'model_name', 'provider_id', 'api_key', 'base_url', 'model_type', 'created_at', 'updated_at'] as const

/** custom_models 数字列清单（toRow 校验用） */
export const CUSTOM_MODEL_NUMBER_COLS = ['context_limit'] as const

/** custom_models 布尔列清单（SQLite 存 0/1，toRow 校验用） */
export const CUSTOM_MODEL_BOOLEAN_COLS = ['enabled', 'test_passed'] as const

// ── providers 表 ─────────────────────────────────────────────────────

/** 预置供应商（对应 providers 表，复制自 showing-agent system_providers） */
export interface ProviderEntity {
  id: string
  name: string
  baseUrl: string
  /** API 模式：'openai' 兼容 或 'anthropic' 原生 */
  apiMode: 'openai' | 'anthropic'
  description: string
  sortOrder: number
  createdAt: string
}

/** providers 数据库行（snake_case 列名） */
export interface ProviderRow {
  id: string
  name: string
  base_url: string
  api_mode: string
  description: string
  sort_order: number
  created_at: string
}

/** providers 字符串列清单（toRow 校验用） */
export const PROVIDER_STRING_COLS = ['id', 'name', 'base_url', 'api_mode', 'description', 'created_at'] as const

/** providers 数字列清单（toRow 校验用） */
export const PROVIDER_NUMBER_COLS = ['sort_order'] as const
