/**
 * api/types.ts — renderer API 层统一类型定义
 *
 * 合并来源：entity 类型（原 types.ts）+ window.api 接口（原 ipc-api-types.ts）
 *           + Agent 契约（原 agent-api-types.ts）+ ToolCenter 类型（原 tool-center-types.ts）
 */

/**
 * types.ts — renderer API 层 entity 类型（底层数据层）
 *
 * 三层：render 侧 api 作为底层数据层（类似 repository），
 * 定义接收 IPC 数据的 entity 形状，store/view 层层向上消费。
 *
 * 原 src/defines/models/* 全部集中于此。
 */

// ── 消息（原 defines/models/message.ts） ──

/** 消息数据模型 */
export interface Message {
  /** 主键 — 服务端返回 long(number)，客户端本地消息为 string */
  id: string | number
  sessionId: string
  conversationId?: string
  /** 角色 — 'clarify' 为客户端 enrich，服务端不返回 */
  role: 'user' | 'assistant' | 'system' | 'approval' | 'clarify'
  messageType?: string
  content: string
  reasoningContent?: string
  /** 时间戳（epoch ms） */
  timestamp: number
  /** 工具调用信息 — 服务端返回 JSON string，客户端 parse 为 ToolCall */
  toolCall?: ToolCall | string | Record<string, { name: string; arguments?: unknown }>
  /** 状态 — 客户端本地消息用 'sending'/'sent'，服务端返回 finishReason 字符串 */
  status: string
  toolName?: string
  toolCallId?: string
  toolCallName?: string   // 流式占位期工具名（toolCall 未拼时胶囊兜底显示）
  approvalArguments?: unknown
  // 服务端返回（MessageVO）
  interactionStatus?: 'pending' | 'approved' | 'rejected' | 'timed_out'
  // 服务端返回（ConversationMessageVO 独有）
  finishReason?: string
  // 客户端 enrich（normalizeMessages / chat-store 填充）
  clarifyQuestion?: string
  clarifyChoices?: string[] | null
  /** 是否为流式消息（客户端本地标记，服务端不返回） */
  isStreaming?: boolean
}

/** 工具调用（renderer 侧 entity，与 main core/llm 的 ToolCall 形状一致） */
export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  result?: unknown
  error?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  toolMultiCall?: Record<string, { name: string; arguments?: Record<string, unknown>; status?: string }>
}

/** 审批请求 */
export interface ApprovalRequest {
  toolCallId: string
  sessionId: string
  name: string
  arguments: Record<string, unknown>
  reason?: string
}

// ── 会话（原 defines/models/session.ts） ──

/** 会话数据模型 */
export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  profile: string
  /** 服务端列表接口永远返回 'idle'，处理中状态由 isProcessingBySession 追踪 */
  status: 'idle'
  /** 推理深度（per-session——'' 或 low/medium/high；默认 medium） */
  reasoningDepth?: string
}

// ── Agent（原 defines/models/agent.ts） ──

/** AgentInfoVO — 列表接口（GET /agent/list）返回 */
export interface AgentListInfo {
  profile: string
  displayName: string
  avatar?: string
  isDefault?: boolean
  isActive?: boolean
}

/** AgentVO — 详情接口（GET /agent/{profile}）返回 */
export interface AgentInfo {
  profile: string
  displayName: string
  avatar?: string
  description?: string
  isDefault?: boolean
  isActive?: boolean
  agentModeId?: string
  agentModeVersion?: string
  createdAt?: string
  /** 对话场景主力模型名 */
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

export interface CreateAgentRequest {
  profile: string
  displayName: string
  avatar?: string
  description?: string
  agentModeId?: string
  agentModeVersion?: string
}

export interface UpdateAgentRequest {
  displayName?: string
  avatar?: string
  description?: string
  agentModeId?: string
  agentModeVersion?: string
  isActive?: boolean
}

/** ModeOptionDTO — GET /agent/mode/list?options=true 返回 */
export interface ModeOptionVO {
  id: string
  versions: string[]
}

/** ModeInfoVO — GET /agent/mode/list?options=false 返回 */
export interface ModeInfo {
  id: string
  version: string
  systemPrompt?: string
  maxIterations?: number
  thresholdPercent?: number
  tailRatio?: number
  status?: string
  createdAt?: string
  updatedAt?: string
}

// ── Agent 配置（原 defines/models/agent-config.ts） ──

/** Agent 配置数据类型 */
export interface AgentConfigData {
  maxIterations: number
  toolExecutionTimeout: number
  maxConversations: number
  memoryMaxChars: number
  userMaxChars: number
  thresholdPercent: number
  tailRatio: number
  agentSoulPrompt: string | null
  warningsEnabled: boolean
  hardStopEnabled: boolean
  exactFailureWarnAfter: number
  sameToolFailureWarnAfter: number
  noProgressWarnAfter: number
  exactFailureBlockAfter: number
  sameToolFailureHaltAfter: number
  noProgressBlockAfter: number
}

// ── 模型（原 defines/models/model.ts） ──

/** 系统供应商 */
export interface SystemProvider {
  id: string
  name: string
  apiMode: string
  baseUrl: string
  description?: string
  sortOrder?: number
  /** 服务端实体字段，前端仅兼容接收 */
  createdAt?: string
}

/** 模型信息 */
export interface ModelInfo {
  id: string
  object: string
  ownedBy: string
}

/** 自定义模型信息 */
export interface CustomModelInfo {
  id: string
  alias: string
  providerId: string
  modelName: string
  apiKey?: string
  baseUrl?: string
  contextLimit?: number
  modelType?: string
  enabled?: boolean
  testPassed?: boolean
  createdAt?: string
}

/** 创建自定义模型的请求参数（apiKey 仅用于发送，服务端不返回） */
export interface CreateCustomModelRequest {
  alias: string
  modelName: string
  providerId: string
  apiKey?: string
  baseUrl?: string
  contextLimit?: number
  modelType?: string
}

/** 场景模型详情 */
export interface SceneModelDetail {
  sceneId: string
  sceneName: string
  bindings: SceneBindingVO[]
}

/** 场景绑定 VO */
export interface SceneBindingVO {
  priority: number
  modelId: string
  modelAlias: string
  modelName: string
  /** 服务端 DTO 字段，前端列表中不使用但兼容接收 */
  sceneId?: string
  /** 是否主模型 */
  isMain?: boolean
}

// ── 提示词模块（原 defines/models/prompt-module.ts） ──

/** 提示词模块数据类型 */
export interface PromptModuleData {
  id: number
  name: string
  content: string
  sortOrder: number
  enabled: boolean
}

// ── 技能（原 defines/models/skill.ts） ──

/** 技能接口 */
export interface SkillInfo {
  id: string
  name: string
  displayName: string
  description?: string
  category?: string
  version?: string
  author?: string
  license?: string
  platforms?: string[]
  /** 环境（文本，对应 DB envs） */
  envs?: string
  /** 正文（详情返回，列表不返回） */
  body?: string
  tags?: string[]
  dependencies?: string[]
  requiresToolsets?: string[]
  requiresTools?: string[]
  fallbackForToolsets?: string[]
  fallbackForTools?: string[]
  triggers?: string[]
  triggerConditions?: string
  config?: string
  envVars?: string
  commands?: string
  isEnabled?: boolean
  isInstalled?: boolean
  updatedAt?: string
  /** 关联技能（详情返回——id/name 列表） */
  related?: Array<{ id: string; name: string }>
}

/** 技能分类 */
/** 技能文件信息（private_skill_files） */
export interface SkillFileInfo {
  id: number
  skillId: string
  fileType: string
  name: string
  content: string
  language: string
  sortOrder: number
  createdAt?: string
}

export interface SkillCategory {
  id: string
  name: string
  displayName: string
  description?: string
  icon?: string
  sortOrder?: number
  isActive?: boolean
}

// ── 模型管理 API（原 defines/api/model-types.ts） ──

/** 自定义模型测试结果 */
export interface CustomModelTestResult {
  success: boolean
  latencyMs?: number
  message?: string
}

/** 更新场景模型绑定请求 */
export interface UpdateSceneModelRequest {
  sceneId: string
  modelId: string | null
}

/** 绑定场景模型请求 */
export interface BindSceneModelRequest {
  sceneId: string
  modelId: string
  profile?: string
  priority?: number
  /** 是否设为主模型（默认 false——备用） */
  isMain?: boolean
}

/** 重排场景绑定请求 */
export interface ReorderSceneBindingsRequest {
  sceneId: string
  priorities: number[]
}

/** 自定义模型更新参数（不包含 modelType — 服务端 UpdateCustomModelRequestVO 无此字段） */
export interface UpdateCustomModelParams {
  id: string
  alias?: string
  modelName?: string
  providerId?: string
  apiKey?: string
  baseUrl?: string
  contextLimit?: number
}

// ── 沙盒白名单 API（原 defines/api/sandbox-types.ts） ──

/** URL 白名单条目 */
export interface UrlWhitelistItem {
  id: number
  urlPattern: string
  description?: string
  userId?: string
  profile?: string
  enabled?: boolean
  createdAt?: string
}

/** 路径白名单条目 */
export interface PathWhitelistItem {
  id: number
  pathPattern: string
  description?: string
  userId?: string
  profile?: string
  enabled?: boolean
  createdAt?: string
}

// ── 工具清单（原 defines/tools/types.ts） ──

/** 工具清单返回项（tool-config:list） */
export interface ToolItem {
  name: string
  description: string
  disabled: boolean
  toolType: string
}

// ── 通用 API 响应（原 defines/api/types.ts） ──

/** 通用 API 响应类型 */
export interface ApiResponse<T = unknown> {
  code?: number
  message?: string
  data?: T
  error?: string
  success?: boolean
}

/** 分页响应 */
export interface PageResponse<T> {
  items: T[]
  total: number
  offset: number
  limit: number
}

/** API 错误 */
export class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly response?: ApiResponse
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ── 客户端环境（原 defines/api/client-env-types.ts） ──

/** 客户端环境信息（tool-center:collect-env 返回） */
export interface ClientEnvInfo {
  os: string
  arch: string
  clientType: string
  shell: string
  homeDir: string
  pathFormat: string
}

// ── 账号初始化 ──

/** 初始化检查项 */
export interface InitCheckItem {
  key: string
  label: string
  passed: boolean
  detail: string
}

/** 初始化状态结果 */
export interface InitStatusResult {
  initialized: boolean
  checks: InitCheckItem[]
}

/** 分步状态检查结果（向导每步进入前调用） */
export interface InitStepStatusResult {
  step: number
  configured: boolean
  /** 缺失字段名列表（step2 字段级检查；空数组 = 完整） */
  missingFields: string[]
  /** 回显数据：step2 = 已有 AgentConfig 或 null；step3 = 模型列表；step4 = null */
  existing: unknown
}

/** 初始化提交参数 */
export interface InitAccountParams {
  nickname: string
  llmProvider: string
  llmModel: string
  llmApiKey: string
  llmBaseUrl?: string
}


// ── Agent 会话契约（原 agent-api-types.ts） ──

/** 消息角色 */
export type AgentMessageRole = 'user' | 'assistant' | 'system' | 'tool'

/** 交互状态 */
export type InteractionStatus = 'pending' | 'approved' | 'rejected' | 'timed_out' | ''

/** 动作事件合并载荷（conversation_complete / session_title_updated / tool_done / exe_client_tool） */
export type { ActionMergedPayload } from '@/renderer/stores/types'

/** 消息类型 */
export type AgentMessageType =
  | 'user_normal'
  | 'user_continue'
  | 'assistant_text'
  | 'assistant_tool_call'
  | 'assistant_hybrid'
  | 'assistant_thinking'
  | 'tool_result'
  | 'approval_request'
  | 'clarify_request'
  | 'system_summary'

/** MessageVO — 渲染层统一消息结构（本地/远端同源） */
export interface AgentMessageVO {
  /** 消息 ID（本地=自增 id，远端=服务端 id） */
  id?: number | string
  sessionId: string
  conversationId: string
  /** 角色 */
  role: AgentMessageRole
  /** 文本内容 */
  content: string
  /** 推理内容（DeepSeek/Claude thinking） */
  reasoningContent?: string
  /** 工具调用（JSON 字符串或对象，同源透传） */
  toolCall?: string | Record<string, {name: string; arguments?: unknown}>
  toolCallId?: string
  toolName?: string
  finishReason?: string
  interactionStatus?: InteractionStatus
  messageType?: AgentMessageType
  /** token 预算（随 agent_response 下发） */
  budget?: {remainingTokens: number; contextLimit: number}
  /** 是否流式（前端标记） */
  isStreaming?: boolean
  createdAt?: string
  updatedAt?: string
}

/** 流式 token 事件（本地/远端同源，对应 LlmChunk） */
export interface AgentStreamEvent {
  /** 文本增量 */
  text?: string
  /** 推理增量 */
  reasoning?: string
  /** 工具参数增量 */
  toolCallArgs?: string
  /** 工具名（工具调用增量首次出现时携带） */
  toolCallName?: string
  /** 是否结束 */
  isFinish: boolean
  finishReason?: string
}

/** 发送消息请求（渲染层 → Agent 层） */
export interface AgentSendRequest {
  /** 会话 ID（首次对话可空，此时用 profile 创建会话） */
  sessionId?: string
  /** Agent 画像标识（必传：明确指定与哪个 Agent 对话） */
  profile: string
  content: string
}

/** 工具结果回调请求 */
export interface AgentToolResultRequest {
  profile: string
  sessionId: string
  toolCallId: string
  result: string
}

/** 审批响应请求 */
export interface AgentApprovalRequest {
  profile: string
  sessionId: string
  toolCallId: string
  approved: boolean
}

/** 审批请求事件（主进程 → 渲染层，弹审批卡片） */
export interface AgentApprovalEvent {
  sessionId?: string
  conversationId?: string
  toolCallId: string
  name: string
  arguments?: unknown
  reason?: string
}

/** Agent 会话 API — 统一接口（local/remote 两套实现） */
export interface AgentApi {
  /** 发送消息（onUserMessage），流式通过回调返回 */
  chat(req: AgentSendRequest, onToken?: (evt: AgentStreamEvent) => void): Promise<AgentMessageVO>
  /** 工具结果回调（UI/扩展工具异步返回） */
  toolResult(req: AgentToolResultRequest): Promise<{ok: boolean}>
  /** 审批响应（用户同意/拒绝） */
  approval(req: AgentApprovalRequest): Promise<{ok: boolean}>
  /** 本轮对话自动批准（当前挂起审批放行 + 本轮后续审批直接放行） */
  autoApprove(conversationId: string): Promise<{ok: boolean}>
  /** 撤回消息 */
  revoke(profile: string, sessionId: string, messageId: string): Promise<{ok: boolean}>
  /** 中断对话（stop） */
  interrupt(profile: string, sessionId: string): Promise<{ok: boolean}>
  /** 清理会话状态 */
  clearAll(profile: string, sessionId: string): Promise<{ok: boolean}>
  /** 统一路由消息入口（route = '{一级}:{二级}'——客户端自行解析分发） */
  onRouteMessage(cb: (payload: { route?: string; sessionId?: string; data?: unknown }) => void): () => void
  /** 监听消息事件（远端推送 / 本地广播） */
  onMessage?(cb: (msg: AgentMessageVO) => void): void
}

/** preload 暴露的 Agent IPC 接口（AgentLocal 的实现契约） */
export interface AgentIpcApi {
  chat(req: AgentSendRequest, onToken?: (evt: AgentStreamEvent) => void): Promise<AgentMessageVO>
  toolResult(req: AgentToolResultRequest): Promise<{ok: boolean}>
  approval(req: AgentApprovalRequest): Promise<{ok: boolean}>
  autoApprove(conversationId: string): Promise<{ok: boolean}>
  revoke(profile: string, sessionId: string, messageId: string): Promise<{ok: boolean}>
  interrupt(profile: string, sessionId: string): Promise<{ok: boolean}>
  clearAll(profile: string, sessionId: string): Promise<{ok: boolean}>
  /** 统一路由消息入口（route = '{一级}:{二级}'——客户端自行解析分发） */
  onRouteMessage(cb: (payload: { route?: string; sessionId?: string; data?: unknown }) => void): () => void
}


// ── ToolCenter 类型（原 tool-center-types.ts） ──

/** 工具 Schema（OpenAI function calling 结构） */
export interface CenterToolSchema {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown> | null
  }
  toolType?: string
  emoji?: string
}

export interface CheckedTool {
  id: string; name: string; description: string; category: string
  source: 'builtin'; available: boolean; reason?: string
  schema: CenterToolSchema
}

export interface McpServerConfig {
  name: string; transport: 'stdio' | 'http'
  command?: string; args?: string[]; url?: string; enabled: boolean
}

export interface McpDiscoveredTool {
  name: string; description: string; inputSchema: Record<string, unknown>
}

export interface McpServerState extends McpServerConfig {
  connected: boolean; lastCheck: string | null; error?: string
  tools: McpDiscoveredTool[]
}

export interface RegisteredTool {
  id: string; name: string; description: string; category: string
  available: boolean; schema: CenterToolSchema
}

export interface ToolCenterState {
  builtin: CheckedTool[]
  mcpServers: McpServerState[]

  updatedAt: string
}


// ── window.api 接口（原 ipc-api-types.ts） ──

/** window.api 完整结构（与 src/preload/index.ts 的 api 对象一一对应） */
/* ── 插件系统类型（协议 v1，与 main/core/plugin/types.ts 对应） ── */

export interface PluginManifest {
  id: string
  name: string
  version: string
  apiVersion: number
  entry: string
  requiresMain?: boolean
  capabilities?: string[]
  /** 插件声明实现的系统开放接口（如 voice.stt / voice.tts） */
  systemInterfaces?: { id: string; version: number }[]
  permissions?: string[]
  description?: string
  modelDeps?: { name: string; dest: string; sizeMB: number; url: string }[]
}

export interface VoiceProviderInfo {
  pluginId: string
  name: string
  version: string
  interfaceVersion: number
  ready?: boolean
}

export interface PluginStatus {
  loaded: boolean
  /** 持久化的启用意图（config.json.enabled） */
  enabled: boolean
  /** 运行时实际注册状态（自检通过并 start → 加入 provider 清单） */
  started?: boolean
  detail?: string
}

/** 自检单项（插件契约 v1 强制 check() 的返回结构） */
export interface PluginCheckItem {
  name: string
  ok: boolean
  hint?: string
  action?: 'download-models' | 'open-config'
}

export interface PluginCheckResult {
  ok: boolean
  checks: PluginCheckItem[]
}

/** 启停结果：启用被自检拦截时 ok=false + checks 引导项；成功时含运行时注册状态 */
export interface ToggleResult {
  ok: boolean
  enabled: boolean
  /** 运行时实际注册状态（start 成功 → true；停用/自检拦截 → false） */
  started?: boolean
  checks?: PluginCheckItem[]
}

export interface PluginInfo {
  manifest: PluginManifest
  status: PluginStatus
}

export type ConfigFieldType = 'string' | 'secret' | 'number' | 'boolean' | 'select' | 'textarea' | 'file'

export interface ConfigField {
  type: ConfigFieldType
  title: string
  description?: string
  default?: unknown
  placeholder?: string
  required?: boolean
  min?: number
  max?: number
  step?: number
  options?: { label: string; value: string }[]
  /** file 专用：文件选择对话框过滤器（[{ name, extensions: ['wav','mp3'] }]） */
  filters?: { name: string; extensions: string[] }[]
}

export interface ConfigSchema {
  type: 'object'
  properties: Record<string, ConfigField>
}

/* ── 桌面 API（preload contextBridge 暴露） ── */

export interface WindowApi {
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  isMaximized: () => Promise<boolean>

  toolCenter: {
    initialize: () => Promise<ToolCenterState>
    recheckMcp: () => Promise<ToolCenterState>
    getState: () => Promise<ToolCenterState>
    getMcpConfigs: () => Promise<McpServerConfig[]>
    upsertMcpServer: (config: McpServerConfig) => Promise<void>
    removeMcpServer: (name: string) => Promise<void>
    collectEnv: () => Promise<ClientEnvInfo>
  }

  checkForUpdates: (manual?: boolean) => Promise<unknown>
  installUpdate: () => Promise<void>
  getAppVersion: () => Promise<{version: string}>
  onUpdateStatus: (cb: (data: {status: string; message?: string}) => void) => () => void
  onUpdateProgress: (cb: (data: {percent: number; speed?: string}) => void) => () => void

  agent: {
    chat: (req: AgentSendRequest, onToken?: (evt: AgentStreamEvent) => void) => Promise<AgentMessageVO>
    toolResult: (sessionId: string, toolCallId: string, result: string) => Promise<void>
    approval: (sessionId: string, toolCallId: string, approved: boolean) => Promise<void>
    autoApprove: (conversationId: string) => Promise<{ok: boolean}>
    revoke: (sessionId: string, messageId: string) => Promise<void>
    interrupt: (sessionId: string) => Promise<void>
    clearAll: (sessionId: string) => Promise<void>
    onApprovalRequest: (cb: (payload: AgentApprovalEvent) => void) => () => void
  }

  sessions: {
    list: (payload: {profile?: string; limit?: number; offset?: number}) => Promise<Session[]>
    create: (payload: {profile?: string; title?: string}) => Promise<Session>
    update: (sessionId: string, title: string, profile: string) => Promise<void>
    getYolo: (profile: string, sessionId: string) => Promise<boolean>
    toggleYolo: (profile: string, sessionId: string) => Promise<boolean>
    setReasoningDepth: (profile: string, sessionId: string, reasoningDepth: string) => Promise<boolean>
    getReasoningDepth: (profile: string, sessionId: string) => Promise<string>
    /** 会话统计（数据面板：平均命中率 + memory 占用） */
    stats: (profile: string, sessionId: string) => Promise<{
      hitRate: number; promptTokens: number; totalTokens: number; rounds: number
      durationMs: number; iterations: number; llmRequests: number
      memoryChars: number; memoryEntries: number; memoryMaxChars: number; memoryPercent: number
    }>
    /** 数据面板整合（只读——上下文窗口/阈值/统计/memory 一口气给前端） */
    dashboard: (profile: string, sessionId: string) => Promise<{
      model: string
      contextLimit: number; currentContextTokens: number; contextUsedPercent: number
      thresholdPercent: number
      hitRate: number; totalTokens: number; promptTokens: number
      durationMs: number; iterations: number; llmRequests: number; rounds: number
      memoryChars: number; memoryEntries: number; memoryMaxChars: number; memoryPercent: number
      userChars: number; userEntries: number; userMaxChars: number; userPercent: number
    }>
  }

  messages: {
    bySession: (sessionId: string, profile?: string, limit?: number, offset?: number) => Promise<Message[]>
    byConversation: (conversationId: string, profile?: string) => Promise<Message[]>
    deleteConversation: (conversationId: string, profile?: string) => Promise<void>
  }

  agents: {
    list: (payload?: {profile?: string}) => Promise<AgentInfo[]>
    create: (payload: {profile: string; displayName?: string; description?: string; avatar?: string}) => Promise<AgentInfo>
    get: (profile: string) => Promise<AgentInfo>
    update: (payload: {profile: string; displayName?: string; description?: string; avatar?: string; isActive?: boolean}) => Promise<AgentInfo>
    delete: (profile: string) => Promise<void>
  }

  agentModes: {
    list: () => Promise<ModeInfo[]>
    options: () => Promise<ModeOptionVO[]>
    get: (id: string, version: string) => Promise<ModeInfo>
    check: (profile: string) => Promise<{ok: boolean; detail: string}>
  }

  agentConfig: {
    get: (profile: string) => Promise<AgentConfigData>
    update: (payload: {profile: string; config: Record<string, unknown>}) => Promise<void>
    reset: (profile: string) => Promise<AgentConfigData>
  }

  models: {
    list: (profile: string) => Promise<CustomModelInfo[]>
    get: (profile: string, id: string) => Promise<CustomModelInfo>
    create: (profile: string, input: CreateCustomModelRequest) => Promise<{id: string}>
    update: (profile: string, input: UpdateCustomModelParams) => Promise<void>
    delete: (profile: string, id: string) => Promise<void>
    test: (profile: string, id: string) => Promise<CustomModelTestResult>
    listProviders: () => Promise<SystemProvider[]>
    getProvider: (id: string) => Promise<SystemProvider>
    fetchModels: (input: {providerId: string; baseUrl?: string; apiKey?: string}) => Promise<ModelInfo[]>
    listScenes: (profile: string) => Promise<SceneModelDetail[]>
    bindScene: (profile: string, input: {sceneId: string; modelId: string; priority?: number; isMain?: boolean}) => Promise<void>
    updateScene: (profile: string, input: UpdateSceneModelRequest) => Promise<void>
    unbindScene: (profile: string, sceneId: string, modelId: string) => Promise<void>
    reorderScenes: (profile: string, input: {sceneId: string; priorities: number[]}) => Promise<void>
  }

  // ── 记忆管理（MemoryController——CRUD + 拖拽排序） ──
  memory: {
    list: (target: 'memory' | 'user', profile?: string) => Promise<string[]>
    add: (target: 'memory' | 'user', content: string, profile?: string) => Promise<{ code: number }>
    update: (target: 'memory' | 'user', index: number, content: string, profile?: string) => Promise<{ code: number }>
    remove: (target: 'memory' | 'user', index: number, profile?: string) => Promise<{ code: number }>
    reorder: (target: 'memory' | 'user', order: string[], profile?: string) => Promise<{ code: number }>
  }

  skills: {
    list: (payload?: {profile?: string; offset?: number; limit?: number}) => Promise<{items: SkillInfo[]; total: number; offset: number; limit: number}>
    byName: (name: string, profile?: string) => Promise<SkillInfo>
    get: (id: string, profile?: string) => Promise<SkillInfo>
    deactivate: (id: string, profile?: string) => Promise<void>
    activate: (id: string, profile?: string) => Promise<void>
    categories: () => Promise<SkillCategory[]>
    /** 安装/创建技能（结构化写入——render 层已解析；name/body 必填） */
    install: (payload: {
      profile?: string; name?: string; displayName?: string; description?: string; category?: string
      version?: string; author?: string; license?: string; platforms?: string; tags?: string
      dependencies?: string; requiresToolsets?: string; requiresTools?: string
      fallbackForToolsets?: string; fallbackForTools?: string; triggers?: string; triggerConditions?: string
      config?: string; envVars?: string; commands?: string; body?: string
      files?: Array<{ fileType: string; name?: string; content: string; sortOrder?: number }>
    }) => Promise<SkillInfo>
    /** 选择技能文件并读取内容（返回 { path, content, files, preview }，取消返回 null） */
    pickInstallFile: () => Promise<{ path: string; content: string; files: Array<{ fileType: string; name: string; content: string; sortOrder: number }>; preview: { name: string; displayName: string; description: string; category: string } | null } | null>
    update: (payload: {
      id: string; profile?: string; displayName?: string; description?: string; category?: string
      version?: string; author?: string; license?: string
      tags?: string; platforms?: string; dependencies?: string; requiresToolsets?: string; requiresTools?: string
      fallbackForToolsets?: string; fallbackForTools?: string; triggers?: string; triggerConditions?: string
      config?: string; envVars?: string; commands?: string; envs?: string; body?: string
    }) => Promise<SkillInfo>
    delete: (id: string, profile?: string) => Promise<null>
    /** 按技能 id 查文件列表 */
    fileList: (skillId: string) => Promise<SkillFileInfo[]>
    /** 新增技能文件 */
    fileSave: (payload: { skillId: string; fileType: string; name?: string; content?: string; language?: string; sortOrder?: number }) => Promise<number>
    /** 更新技能文件 */
    fileUpdate: (payload: { id: number; fileType?: string; name?: string; content?: string; language?: string; sortOrder?: number }) => Promise<null>
    /** 删除技能文件 */
    fileDelete: (id: number) => Promise<null>
  }

  account: {
    initStatus: () => Promise<InitStatusResult>
    initStepStatus: (step: number) => Promise<InitStepStatusResult>
    initStep1: (input: {displayName?: string}) => Promise<AgentInfo>
    initStep2: (config?: Record<string, unknown>) => Promise<void>
    initStep3: (input: InitAccountParams) => Promise<{id: string}>
    initStep4: (modelId: string) => Promise<void>
  }

  promptModules: {
    list: (profile: string) => Promise<PromptModuleData[]>
    create: (name: string, content: string, profile: string, enabled?: boolean) => Promise<PromptModuleData>
    update: (id: number, name: string, content: string, profile: string) => Promise<PromptModuleData>
    delete: (id: number, profile: string) => Promise<void>
    toggle: (id: number, enabled: boolean, profile: string) => Promise<void>
  }

  sandbox: {
    listUrl: (profile?: string) => Promise<UrlWhitelistItem[]>
    addUrl: (payload: {urlPattern: string; description?: string; profile?: string}) => Promise<{id: number; profile: string; urlPattern: string}>
    deleteUrl: (id: number, profile?: string) => Promise<void>
    listPath: (profile?: string) => Promise<PathWhitelistItem[]>
    addPath: (payload: {pathPattern: string; description?: string; profile?: string}) => Promise<{id: number; profile: string; pathPattern: string}>
    deletePath: (id: number, profile?: string) => Promise<void>
  }

  tools: {
    list: (profile?: string) => Promise<ToolItem[]>
    toggle: (toolName: string, disabled: boolean, profile?: string) => Promise<ToolItem>
  }

  plugins: {
    list: () => Promise<PluginInfo[]>
    toggle: (id: string, enabled: boolean) => Promise<ToggleResult>
    check: (id: string) => Promise<PluginCheckResult>
    getStatus: (id: string) => Promise<PluginStatus>
    getSchema: (id: string) => Promise<ConfigSchema | null>
    getConfig: (id: string) => Promise<Record<string, unknown>>
    saveConfig: (id: string, patch: Record<string, unknown>) => Promise<boolean>
    /** 调用插件注册的 IPC 能力 */
    invoke: (id: string, channel: string, payload?: unknown) => Promise<unknown>
    /** 文件选择对话框（配置表单 file 字段） */
    pickFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
    /** 安装插件：路径可为插件文件夹或 .zip 插件包（自动检测） */
    install: (path: string) => Promise<PluginInfo>
    /** 卸载插件（删除插件及下载的模型） */
    uninstall: (id: string) => Promise<void>
    /** 选择插件包：zip（文件对话框）或 folder（目录对话框） */
    pickInstallPackage: (kind?: 'zip' | 'folder') => Promise<string | null>
  }

  voice: {
    providers: () => Promise<{ stt: VoiceProviderInfo[]; tts: VoiceProviderInfo[] }>
    getConfig: () => Promise<{ sttProvider: string | null; ttsProvider: string | null }>
    setProvider: (patch: { sttProvider?: string | null; ttsProvider?: string | null }) => Promise<{ sttProvider: string | null; ttsProvider: string | null }>
    providerReady: (pluginId: string) => Promise<boolean>
    /** STT：整段音频（Float32Array 16kHz）转文本 */
    sttTranscribe: (samples: Float32Array) => Promise<{ text: string }>
    /** TTS：文本合成 → audio data URL */
    ttsSpeak: (text: string) => Promise<{ audio: string }>
  }

  /** 通用设置（快捷键等全局键值配置） */
  generalSettings: {
    get: () => Promise<{ settings: Record<string, string>; shortcuts: Array<{ key: string; label: string; description: string; value: string }> }>
    set: (key: string, value: string) => Promise<void>
    reset: (key: string) => Promise<void>
  }
}

declare global {
  interface Window {
    api: WindowApi
  }
}

export {}
