/**
 * types.ts — Controller 层 VO 定义（IPC 出口类型）
 *
 * Three layers: controller builds VOs (outbound), service builds DTOs,
 * repository builds entities.
 * Local client: controller VOs ARE the data shape returned to the renderer over IPC.
 *
 * Unified agent-session contract (same shape local & remote).
 */

/** 消息角色 */
export type AgentMessageRole = 'user' | 'assistant' | 'system' | 'tool'

/** 交互状态 */
export type InteractionStatus = 'pending' | 'approved' | 'rejected' | 'timed_out' | ''

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
export interface StreamToken {
  /** 文本增量 */
  text?: string
  /** 推理增量 */
  reasoning?: string
  /** 工具参数增量 */
  toolCallArgs?: string
  /** 工具名（工具调用增量首次出现时携带——前端流式拼工具卡片） */
  toolCallName?: string
  /** 工具调用 index（多工具时区分——前端按 index 分路拼装；缺省 0 单工具兼容） */
  toolCallIndex?: number
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

/** AgentWorker 路径发送请求（user 文本 → host → AgentWorker 进程 → AgentLoop → 流式 → UI） */
export interface AgentWorkerSendRequest {
  /** 会话 ID（可空——此时主进程先按 profile 创建会话） */
  sessionId?: string
  /** Agent 画像标识（必传） */
  profile: string
  /** 用户文本 */
  text: string
}

/** 审批请求事件（主进程 → 渲染层，弹审批卡片） */
export interface AgentApprovalEvent {
  toolCallId: string
  name: string
  arguments?: unknown
  reason?: string
}

// ── Agent（agent-controller） ──

/** 工具结果回调请求 DTO */
export interface AgentToolResultRequestDTO {
  /** Agent 画像标识（围绕 Agent 的行为必传） */
  profile: string
  sessionId: string
  toolCallId: string
  result: string
}

/** 审批响应请求 DTO */
export interface AgentApprovalRequestDTO {
  /** Agent 画像标识（围绕 Agent 的行为必传） */
  profile: string
  sessionId: string
  toolCallId: string
  approved: boolean
}

/** 撤回消息请求 DTO */
export interface AgentRevokeRequestDTO {
  /** Agent 画像标识（围绕 Agent 的行为必传） */
  profile: string
  sessionId: string
  messageId: string
}

/** 中断会话请求 DTO */
export interface AgentInterruptRequestDTO {
  /** Agent 画像标识（围绕 Agent 的行为必传） */
  profile: string
  sessionId: string
}

/** 清理会话请求 DTO */
export interface AgentClearAllRequestDTO {
  /** Agent 画像标识（围绕 Agent 的行为必传） */
  profile: string
  sessionId: string
}

// ── Session（session-controller） ──

/** 会话列表项 VO */
export interface SessionListItemVO {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  profile: string
  status: 'idle'
  yolo: boolean
  /** 推理深度（per-session——'' 或 low/medium/high；默认 medium） */
  reasoningDepth?: string
  /** 回复提醒（per-session——对话完成时播放提醒音效；默认关闭） */
  notifyOnComplete?: boolean
}

/** 创建会话请求 DTO */
export interface CreateSessionRequestDTO {
  profile?: string
  title?: string
}

/** 更新会话标题请求 DTO */
export interface UpdateSessionRequestDTO {
  sessionId: string
  /** Agent 画像标识（必传：profile 限定） */
  profile: string
  title: string
}

/** 会话列表查询 DTO */
export interface ListSessionsQueryDTO {
  profile?: string
  limit?: number
  offset?: number
}

// ── Message（message-controller） ──

/** 会话消息查询 DTO */
export interface SessionMessagesQueryDTO {
  sessionId: string
  profile?: string
  limit?: number
  offset?: number
}

/** 对话消息查询 DTO */
export interface ConversationMessagesQueryDTO {
  conversationId: string
  profile?: string
}

/** 删除对话消息请求 DTO */
export interface DeleteConversationRequestDTO {
  conversationId: string
  profile?: string
}

// ── Tool（tool-controller） ──

/** 工具清单项 VO */
export interface ToolItemVO {
  name: string
  description: string
  /** 是否支持 provider 模式（工具管理页显示设置按钮 + L3 provider 设置入口） */
  supportsProvider?: boolean
  /** 工具不可用原因（check 失败——管理页 tps-tool-error 展示） */
  error?: string
  /** 是否可编辑授权（仅 creator 模式 true——其余模式只读） */
  editable?: boolean
  /** 是否已授权给该 profile（creator 模式——agent_tools 勾选态） */
  authorized?: boolean
  /** 注册来源：builtin（框架内置）/ external（外置安装）——前端 Tab 分组 */
  source?: 'builtin' | 'external'
}

/** 工具清单查询 DTO */
export interface ToolListQueryDTO {
  profile?: string
}

/** 工具授权切换请求 DTO（creator 模式：authorize/revoke agent_tools） */
export interface ToggleToolRequestDTO {
  toolName: string
  authorized: boolean
  profile?: string
}

// ── Skill（skill-controller） ──

/** 技能信息 VO（轻量） */
export interface SkillInfoVO {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  version: string
  author: string
  tags: string[]
  platforms: string[]
  dependencies: string[]
  requiresToolsets: string[]
  requiresTools: string[]
  fallbackForToolsets: string[]
  fallbackForTools: string[]
  triggers: string[]
  triggerConditions: string
  config: string
  envVars: string
  commands: string
  compatibility: string
  allowedTools: string
  metadata: string
  envs: string
  /** 启用状态（停用 = 软删） */
  isEnabled: boolean
  /** 详情返回（列表不返回，节省传输） */
  body?: string
  /** 关联技能（详情返回——id/name 列表；模型可 skill_view 继续查看） */
  related?: Array<{ id: string; name: string }>
}

/** 技能列表查询 DTO */
export interface SkillListQueryDTO {
  profile?: string
  offset?: number
  limit?: number
  /** 按分类过滤（name） */
  category?: string
  /** 按名称模糊过滤（name/displayName） */
  name?: string
}

/** 技能分页响应 VO */
export interface SkillPageVO {
  items: SkillInfoVO[]
  total: number
  offset: number
  limit: number
}

/** 技能操作请求 DTO（byName/deactivate/activate） */
export interface SkillOpRequestDTO {
  name?: string
  id?: string
  profile?: string
}

// ── PromptModule（prompt-module-controller） ──

/** 创建模块请求 DTO */
export interface CreatePromptModuleRequestDTO {
  /** Agent 画像标识（必传） */
  profile: string
  name: string
  content: string
  enabled?: boolean
}

/** 更新模块请求 DTO */
export interface UpdatePromptModuleRequestDTO {
  id: number
  /** Agent 画像标识（必传：profile 限定） */
  profile: string
  name: string
  content: string
  sortOrder?: number
}

/** 模块 ID 请求 DTO */
export interface PromptModuleIdRequestDTO {
  id: number
  /** Agent 画像标识（必传：profile 限定） */
  profile: string
}

/** 模块切换请求 DTO */
export interface TogglePromptModuleRequestDTO {
  id: number
  /** Agent 画像标识（必传：profile 限定） */
  profile: string
  enabled: boolean
}

// ── Sandbox（sandbox-controller） ──

/** URL 白名单请求 DTO */
export interface UrlWhitelistRequestDTO {
  urlPattern: string
  description?: string
  profile?: string
}

/** 路径白名单请求 DTO */
export interface PathWhitelistRequestDTO {
  pathPattern: string
  description?: string
  profile?: string
}

/** 白名单条目 ID 请求 DTO */
export interface WhitelistIdRequestDTO {
  id: number
  profile?: string
}
