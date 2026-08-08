/**
 * types.ts — src/main/db 包统一类型定义
 *
 * 集中存放 db 包下所有表实体、入参、数据库行、列清单类型。
 * Repository / IPC / 上层服务统一从这里 import，避免散落各处。
 */

// ── custom_models 表 ──────────────────────────────────────────────

/** 自定义模型实体（对应 custom_models 表，参考 tinker-agent UserCustomModelEntity 去掉 user_id） */
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

/** 预置供应商（对应 providers 表，复制自 tinker-agent system_providers） */
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

// ── agents 表 ──────────────────────────────────────────────────────

/** Agent 实体（对应 AgentEntity） */
export interface AgentEntity {
  profile: string
  displayName: string
  description: string
  avatar: string
  isDefault: boolean
  isActive: boolean
  agentModeId: string
  agentModeVersion: string
  createdAt?: string
  deletedAt?: string | null
}

/** Agent 模式信息 DTO（对应 AgentModeInfoDTO） */
export interface AgentModeInfoDTO {
  agentModeId: string
  agentModeVersion: string
}

// ── agent_configs 表 ───────────────────────────────────────────────

/** Agent 配置实体（对应 AgentConfigEntity，NULL = 使用全局默认值） */
export interface AgentConfigEntity {
  profile: string
  maxIterations: number
  thresholdPercent: number
  tailRatio: number
  toolExecutionTimeout: number
  maxConversations: number
  memoryMaxChars: number
  userMaxChars: number
  /** Agent 灵魂提示词（agent_soul_prompt） */
  agentSoulPrompt: string | null
  warningsEnabled: number
  hardStopEnabled: number
  exactFailureWarnAfter: number
  sameToolFailureWarnAfter: number
  noProgressWarnAfter: number
  exactFailureBlockAfter: number
  sameToolFailureHaltAfter: number
  noProgressBlockAfter: number
  createdAt?: string
  updatedAt?: string
}

// ── sessions 表 ────────────────────────────────────────────────────

/** 会话实体（对应 SessionEntity） */
export interface SessionEntity {
  id: string
  profile: string
  source: string
  systemPrompt: string
  parentSessionId: string | null
  title: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalDurationMs?: number
  totalIterations?: number
  totalLlmRequests?: number
  /** 当前上下文总量（冗余——最新一轮，dashboard 直接拉） */
  currentContextTokens?: number
  estimatedCostUsd: number
  messageCount: number
  toolCallCount: number
  rewindCount: number
  startedAt: string
  archived: boolean
  yolo: boolean
  /** 推理深度（per-session——'' 或 low/medium/high；创建时默认 'medium'） */
  reasoningDepth: string
}

/** 会话摘要 DTO（browseRich 返回） */
export interface SessionSummaryDTO {
  sessionId: string
  title: string
  preview: string
  source: string
  lastActivity: string
  messageCount: number
}

// ── conversations 表 ───────────────────────────────────────────────

/** 对话实体（对应 ConversationEntity） */
export interface ConversationEntity {
  id: string
  sessionId: string
  status: string
  messageCount: number
  estimatedTokens: number
  totalTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  durationMs?: number
  iterationCount?: number
  llmRequestCount?: number
  /** 本轮上下文总量（flush 时取最后 assistant 消息的 prompt_tokens） */
  roundContextTokens?: number
  startedAt?: string
  completedAt?: string | null
}

/** 对话状态更新（updateStatus 参数） */
export interface ConversationStatusUpdate {
  messageCount?: number
  estimatedTokens?: number
  totalTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  durationMs?: number
  iterationCount?: number
  llmRequestCount?: number
  roundContextTokens?: number
  completedAt?: string | null
}

// ── messages 表 ────────────────────────────────────────────────────

/** 消息实体（对应 MessageEntity） */
export interface MessageEntity {
  /** 主键（insert 后由 DB 生成） */
  id?: number
  sessionId: string
  conversationId: string | null
  profile: string
  role: string
  content: string
  reasoningContent: string
  toolCall: string | null
  toolCallId: string | null
  toolName: string | null
  finishReason: string | null
  interactionStatus: string
  /** usage 统计（每轮每请求——命中率数据源；仅记录不展示） */
  promptTokens?: number
  completionTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  messageType: string
  deleted: boolean
  createdAt?: string
  updatedAt?: string
}

/** 消息查询参数 */
export interface MessageQuery {
  sessionId?: string
  profile: string
  role?: string
  conversationId?: string
  deleted?: boolean
  sortOrder?: 'ASC' | 'DESC'
  limit?: number
  offset?: number
  /** 消息类型（精确匹配） */
  messageType?: string
  /** 消息类型列表（IN 匹配） */
  messageTypes?: string[]
  /** 排除的消息类型（NOT IN） */
  excludeMessageTypes?: string[]
  /** 是否按时间倒序（true = DESC） */
  sortDesc?: boolean
}

/** 会话消息查询参数（分页） */
export interface SessionMessageQuery {
  sessionId: string
  profile: string
  limit?: number
  offset?: number
  asc?: boolean
  /** 角色过滤（IN 匹配） */
  roles?: string[]
  /** 消息类型过滤（IN 匹配——DISPLAY_SET 可见性在 SQL 层做，LIMIT 才准确） */
  messageTypes?: string[]
  /** 排序（ASC/DESC） */
  sortOrder?: 'ASC' | 'DESC'
}

// ── 技能分类（JSON 文件源——无数据库表） ──────────────────────────

/** 技能分类实体（对应 SkillCategoryEntity） */
export interface SkillCategoryEntity {
  id: string
  name: string
  displayName: string
  description: string
  icon: string
  sortOrder: number
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

// ── system_providers 表 ────────────────────────────────────────────

/** 系统供应商实体（对应 SystemProviderEntity） */
export interface SystemProviderEntity {
  id: string
  name: string
  baseUrl: string
  apiMode: string
  description: string
  sortOrder: number
}

// ── private_skills 表 ──────────────────────────────────────────────

/** 私有技能实体（对应 PrivateSkillEntity） */
export interface PrivateSkillEntity {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  version: string
  author: string
  license: string
  /** 逗号分隔的平台（原 TEXT[]） */
  platforms: string
  /** 逗号分隔的标签 */
  tags: string
  /** 逗号分隔的依赖 */
  dependencies: string
  requiresToolsets: string
  requiresTools: string
  fallbackForToolsets: string
  fallbackForTools: string
  triggers: string
  triggerConditions: string
  /** JSON 字符串（原 JSONB '[]'） */
  config: string
  envVars: string
  commands: string
  envs: string | null
  apiKey: string | null
  body: string
  isDeleted: boolean
  deletedAt: string | null
  profile: string
  officialSkillId: string | null
  createdAt?: string
  updatedAt?: string
}

/** 过滤后的技能 DTO（findFiltered） */
export interface FilteredSkillDTO {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  version: string
  author: string
  isDeleted: boolean
  /** 逗号分隔的标签 */
  tags: string
  /** API key 是否配置（readiness 判断：available / setup_needed） */
  apiKey: string | null
  /** 平台筛选 */
  platforms: string
  /** 客户端类型筛选 */
  requiresToolsets: string
}

// ── private_skill_files 表 ─────────────────────────────────────────

/** 技能文件实体（对应 SkillFileEntity） */
export interface SkillFileEntity {
  id?: number
  skillId: string
  fileType: string
  /** 文件名（安装时从文件路径提取） */
  name?: string
  content: string
  language: string
  sortOrder: number
  createdAt?: string
}

// ── private_skill_related 表 ───────────────────────────────────────

/** 技能关联实体（对应 SkillRelatedEntity） */
export interface SkillRelatedEntity {
  id?: number
  skillId: string
  relatedSkillId: number
  relationType: string
  createdAt?: string
}

// ── user_url_whitelist 表 ──────────────────────────────────────────

/** URL 白名单实体（对应 UserUrlWhitelistEntity） */
export interface UserUrlWhitelistEntity {
  id?: number
  profile: string
  urlPattern: string
  description: string
  enabled: boolean
  createdAt?: string
}

// ── user_path_whitelist 表 ─────────────────────────────────────────

/** 路径白名单实体（对应 UserPathWhitelistEntity） */
export interface UserPathWhitelistEntity {
  id?: number
  profile: string
  pathPattern: string
  description: string
  enabled: boolean
  createdAt?: string
}

// ── prompt_modules 表 ─────────────────────────────────────────────

/** 用户提示词模块实体（对应 UserPromptModuleEntity） */
export interface UserPromptModuleEntity {
  id?: number
  profile: string
  name: string
  content: string
  sortOrder: number
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

// ── user_scene_models 表 ───────────────────────────────────────────

/** 场景模型绑定实体（对应 UserSceneModelEntity） */
export interface UserSceneModelEntity {
  profile: string
  sceneId: string
  modelId: string
  priority: number
  /** 是否主模型（场景内且仅一个 is_main=1） */
  isMain?: boolean
  createdAt?: string
}

/** 场景绑定（含模型详情） */
export interface SceneModelBinding {
  sceneId: string
  sceneName: string
  modelId: string
  modelAlias: string
  modelName: string
  providerId: string
  providerName: string
  apiMode: string
  priority: number
  /** 是否主模型 */
  isMain?: boolean
}

// ── tool-center 持久化（表 tool_registry / mcp_servers） ──

/** 内置工具检测快照行 */
export interface ToolRegistryRow {
  id: string
  source: string
  available: number
  reason: string | null
  schemaJson: string
  checkedAt: string
}

/** MCP 服务器配置行 */
export interface McpServerRow {
  name: string
  transport: string
  command: string | null
  argsJson: string
  url: string | null
  enabled: number
  createdAt: string
  updatedAt: string
}

/** MCP 工具定义行（首次发现后持久化） */
export interface McpToolRow {
  name: string
  serverName: string
  toolName: string
  description: string
  inputSchema: string
  enabled: number
  createdAt: string
  updatedAt: string
}
