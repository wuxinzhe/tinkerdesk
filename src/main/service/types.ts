/**
 * types.ts — 服务层统一类型定义（DTO 集中）
 *
 * 三层：service 构建 DTO（层间传递），controller 构建 VO（出口），
 * repository 构建 entity（表结构）。
 *
 * 各 Service 的类型定义集中于此（实现留在各自文件）。
 */

// ── compression-cooldown-store ──

/** 冷却条目：失败计数 + 过期时间戳 */
export interface CooldownEntry {
  failCount: number
  expiresAt: number
}

// ── memory-store ──

/** 记忆操作 */
export interface MemoryOperation {
  /** 操作类型：'add' | 'replace' | 'remove' */
  action: 'add' | 'replace' | 'remove'
  /** entry 内容（add/replace 必填） */
  content: string
  /** replace/remove 时匹配的子串 */
  oldText: string
}

// ── todo-service ──

/** 待办事项 */
export interface TodoItem {
  id: string
  content: string
  status: string
}

/** 待办列表响应 */
export interface TodoListResponse {
  todos: TodoItem[]
  summary: TodoSummary
}

/** 待办汇总 */
export interface TodoSummary {
  total: number
  pending: number
  inProgress: number
  completed: number
}

// ── session-service ──

/** 会话搜索命中 */
export interface DiscoverHitDTO {
  sessionId: string
  when: string
  source: string
  title: string
  matchedRole: string
  matchMessageId: number
  snippet: string
  bookendStart: Array<{id: number; role: string; content: string}>
  messages: Array<{id: number; role: string; content: string}>
  bookendEnd: Array<{id: number; role: string; content: string}>
  messagesBefore: number
  messagesAfter: number
}

/** 会话读取结果 */
export interface ReadResultDTO {
  sessionId: string
  source: string
  title: string
  when: string
  messageCount: number
  truncated: boolean
  messages: Array<{id: number; role: string; content: string}>
}

/** 会话滚动结果 */
export interface ScrollResultDTO {
  window: Array<{id: number; role: string; content: string}>
  messagesBefore: number
  messagesAfter: number
}

// ── skill-service ──

/** 技能概要 */
export interface SkillSummaryDTO {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  version: string
  updatedAt: string
  readinessStatus: string
}

/** 技能详情 */
export interface SkillDetailDTO {
  id: string
  name: string
  description: string
  category: string
  oss: string[]
  clientTypes: string[]
  tags: string[]
  dependencies: string[]
  requiresToolsets: string[]
  requiresTools: string[]
  fallbackForToolsets: string[]
  fallbackForTools: string[]
  triggers: string[]
  triggerConditions: string
  config: string
  envVars: string[]
  commands: string[]
  body: string
  version: string
  author: string
  license: string
  updatedAt: string
  apiKey: string | null
}

// ── model ──

/** Agent 信息 DTO */
export interface AgentInfoDTO {
  profile: string
  displayName: string
  description: string
  avatar: string
  isDefault: boolean
  isActive: boolean
  agentModeId: string
  agentModeVersion: string
  createdAt?: string
  /** 对话场景主力模型名（详情展示用） */
  mainModelName?: string
  /** 记忆占用（profile 级——与 AgentInfo 一起返回） */
  memoryChars?: number
  memoryEntries?: number
  memoryMaxChars?: number
  memoryPercent?: number
  userChars?: number
  userEntries?: number
  userMaxChars?: number
  userPercent?: number
}

/** 创建 Agent 请求 DTO */
export interface CreateAgentRequestDTO {
  profile: string
  displayName?: string
  description?: string
  avatar?: string
  agentModeId?: string
  agentModeVersion?: string
  /** 是否设为默认 Agent（初始化 Step1 用） */
  isDefault?: boolean
}

/** 更新 Agent 请求 DTO */
export interface UpdateAgentRequestDTO {
  profile: string
  displayName?: string
  description?: string
  avatar?: string
  agentModeId?: string
  agentModeVersion?: string
  isActive?: boolean
}

/** 供应商拉取模型信息 DTO */
export interface ModelInfoDTO {
  id: string
  object: string
  ownedBy: string
}

/** 拉取供应商模型请求 DTO */
export interface FetchModelsRequestDTO {
  providerId: string
  baseUrl?: string
  apiKey?: string
}

/** 自定义模型信息 DTO */
export interface CustomModelInfoDTO {
  id: string
  alias: string
  modelName: string
  providerId: string
  apiKey?: string
  baseUrl?: string
  contextLimit?: number
  modelType?: string
  enabled?: boolean
  testPassed?: boolean
  createdAt?: string
}

/** 创建自定义模型请求 DTO */
export interface CreateCustomModelRequestDTO {
  alias: string
  modelName: string
  providerId: string
  apiKey?: string
  baseUrl?: string
  contextLimit?: number
  modelType?: string
}

/** 更新自定义模型请求 DTO */
export interface UpdateCustomModelRequestDTO {
  id: string
  alias?: string
  modelName?: string
  providerId?: string
  apiKey?: string
  baseUrl?: string
  contextLimit?: number
}

/** 自定义模型测试结果 DTO */
export interface CustomModelTestResultDTO {
  success: boolean
  latencyMs: number
  message: string
}

/** 场景绑定 DTO */
export interface SceneBindingDTO {
  sceneId: string
  priority: number
  modelId: string
  modelAlias: string
  modelName: string
  /** 是否主模型 */
  isMain?: boolean
}

/** 场景模型详情 DTO */
export interface SceneModelDetailDTO {
  sceneId: string
  sceneName: string
  bindings: SceneBindingDTO[]
}

/** 绑定场景模型请求 DTO */
export interface BindSceneModelRequestDTO {
  sceneId: string
  modelId: string
  priority?: number
  /** 是否设为主模型（默认 false——备用） */
  isMain?: boolean
}

/** 更新场景模型请求 DTO */
export interface UpdateSceneModelRequestDTO {
  sceneId: string
  modelId: string | null
}

/** 重排场景绑定请求 DTO */
export interface ReorderSceneBindingsRequestDTO {
  sceneId: string
  /** 新顺序的模型 id 列表（长度 = 场景绑定数） */
  modelIds: string[]
  /** 兼容旧参数（模型 id 列表顺序映射） */
  priorities?: number[]
}

/** 删除场景绑定请求 DTO */
export interface UnbindSceneModelRequestDTO {
  sceneId: string
  priority: number
}

// ── account ──

/** 账号初始化请求 DTO */
export interface InitRequestDTO {
  nickname: string
  llmProvider: string
  llmModel: string
  llmApiKey: string
  llmBaseUrl?: string
}

/** 初始化检查项 DTO */
export interface CheckItemDTO {
  key: string
  label: string
  passed: boolean
  detail: string
}

/** 初始化状态响应 DTO */
export interface InitStatusResponseDTO {
  initialized: boolean
  checks: CheckItemDTO[]
}

/** 分步状态响应 DTO：configured + 缺失字段 + 回显数据（初始化向导每步检查用） */
export interface StepStatusDTO {
  step: number
  configured: boolean
  /** 缺失字段名列表（step2 字段级检查；空数组 = 完整） */
  missingFields: string[]
  /** 回显数据：step2 = 已有 AgentConfig（无行时为 null）；step3 = 模型列表；step4 = null */
  existing: unknown
}

// ── 门检决策枚举 ──

/** 授权决策 */
export enum AuthzDecision {
  ALLOW = 'ALLOW',
  ASK = 'ASK',
  DENY = 'DENY',
}

/** 沙盒决策 */
export enum SandboxDecision {
  ALLOW = 'ALLOW',
  ASK = 'ASK',
}

/** 工具循环防护决策动作 */
export enum GuardrailAction {
  ALLOW = 'allow',
  WARN = 'warn',
  BLOCK = 'block',
  HALT = 'halt',
}

/** 工具循环防护决策结果 */
export interface GuardrailDecision {
  action: GuardrailAction
  code: string
  message: string
  toolName: string
  count: number
}

/** 用户消息队列条目（MessageQueueStore 元素） */
export interface UserMessageQueueItem {
  /** 队列内唯一 id（用于撤回） */
  id: string
  /** 消息内容 */
  content: string
  /** 用户使用的 AI 角色配置名称 */
  profile: string
}
