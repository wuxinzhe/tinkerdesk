import { contextBridge, ipcRenderer } from 'electron'
import type {
  
  AgentApprovalRequestDTO,
  AgentSendRequest,
  AgentToolResultRequestDTO,
  ConversationMessagesQueryDTO,
  CreatePromptModuleRequestDTO,
  CreateSessionRequestDTO,
  DeleteConversationRequestDTO,
  ListSessionsQueryDTO,
  PathWhitelistRequestDTO,
  PromptModuleIdRequestDTO,
  SessionMessagesQueryDTO,
  SkillListQueryDTO,
  SkillOpRequestDTO,
  StreamToken,
  TogglePromptModuleRequestDTO,
  UpdatePromptModuleRequestDTO,
  UpdateSessionRequestDTO,
  UrlWhitelistRequestDTO,
  WhitelistIdRequestDTO
} from '../main/controller/types'
import { EVT_CHAT_TOKEN, IPC_MESSAGE, ROUTE_CHAT, ROUTE_ERROR, ROUTE_TIP } from '../main/core/constants'
import type { BindSceneModelRequestDTO, CreateCustomModelRequestDTO, FetchModelsRequestDTO, InitRequestDTO as InitAccountParams, ReorderSceneBindingsRequestDTO, UpdateCustomModelRequestDTO, UpdateSceneModelRequestDTO } from '../main/service/types'

/** IPC 响应解包：controller 返回 {success, data, error}，取 data 或抛错 */
function unwrap<T>(res: unknown): T {
  const r = res as { success?: boolean; data?: T | null; error?: string | null }
  if (r && r.success === false) {
    throw new Error(r.error ?? '操作失败')
  }
  return (r?.data ?? null) as T
}

/** 参数/响应脱敏：递归替换 apiKey/llmApiKey 等敏感字段为 '***'（支持数组） */
function redactArgs(v: unknown): unknown {
  try {
    if (Array.isArray(v)) return v.map(redactArgs)
    if (v && typeof v === 'object') {
      const copy: Record<string, unknown> = { ...(v as Record<string, unknown>) }
      for (const k of Object.keys(copy)) {
        if (/apiKey|llmApiKey|token/i.test(k)) {
          copy[k] = '***'
        } else if (copy[k] && typeof copy[k] === 'object') {
          copy[k] = redactArgs(copy[k])
        }
      }
      return copy
    }
    return v
  } catch {
    return v
  }
}

/** 日志截断：超长内容截断并标注原始长度（防大响应刷屏） */
function truncateLog(v: unknown, max = 800): unknown {
  try {
    const s = JSON.stringify(v)
    if (!s || s.length <= max) return v
    return `${s.slice(0, max)}… (${s.length} chars)`
  } catch {
    return String(v)
  }
}

/**
 * 统一 IPC 调用入口（带日志）：request 参数 + response 数据 + 耗时 + 成功/失败（均脱敏）。
 * DevTools Console filter 输入 `[IPC` 只看全部 IPC 调用。
 * 失败时派发 window 'global-tip' 事件（type=error）→ GlobalTipToast 队列展示（App.vue 全局组件）。
 */
function inv<T>(channel: string, ...args: unknown[]): Promise<T> {
  const t = Date.now()
  const req = truncateLog(redactArgs(args))
  return ipcRenderer.invoke(channel, ...args).then((res) => {
    const r = res as { success?: boolean; data?: unknown; error?: string | null }
    const failed = r?.success === false
    const ms = Date.now() - t
    if (failed) {
      console.error(`[IPC] ✗ ${channel} ${ms}ms`, r?.error ?? '操作失败', req)
      dispatchGlobalTip('error', channel, r?.error ?? '操作失败，请重试')
    } else {
      const resp = truncateLog(redactArgs(r?.data))
      console.log(`[IPC] ✓ ${channel} ${ms}ms`, req, '→', resp)
    }
    return res as T
  }).catch((e: Error) => {
    console.error(`[IPC] ✗ ${channel} ${Date.now() - t}ms`, e.message || '操作失败，请重试', req)
    dispatchGlobalTip('error', channel, e.message || '操作失败，请重试')
    throw e
  })
}

/** 静默 IPC 调用（探测性调用专用——失败只 console 不弹全局 toast——
 *  如插件配置页一次性探测 check/schema/config/status——Worker 挂时
 *  多个失败是预期——不该弹多次相同错误） */
function invSilent<T>(channel: string, ...args: unknown[]): Promise<T> {
  const t = Date.now()
  const req = truncateLog(redactArgs(args))
  return ipcRenderer.invoke(channel, ...args).then((res) => {
    const r = res as { success?: boolean; data?: unknown; error?: string | null }
    const failed = r?.success === false
    const ms = Date.now() - t
    if (failed) {
      console.warn(`[IPC] ~ ${channel} ${ms}ms`, r?.error ?? '操作失败', req)
    } else {
      const resp = truncateLog(redactArgs(r?.data))
      console.log(`[IPC] ✓ ${channel} ${ms}ms`, req, '→', resp)
    }
    return res as T
  }).catch((e: Error) => {
    console.warn(`[IPC] ~ ${channel} ${Date.now() - t}ms`, e.message || '操作失败，请重试', req)
    throw e
  })
}

/** 派发全局通知事件（GlobalTipToast 监听；type: error | tip） */
function dispatchGlobalTip(type: 'error' | 'tip', code: string, message: string): void {
  try {
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type, code, message } }))
  } catch {
    // preload 环境异常时静默（日志已记录）
  }
}

// ── main → renderer 统一消息通道：agent:message（route = '{一级}:{二级}'，协议见 docs/event-protocol.md）──
// 顶层分发 tip/error 域 → GlobalTipToast；chat/session/action 域由 agent.onMessage 消费
ipcRenderer.on(IPC_MESSAGE, (_event, payload: { route?: string; data?: unknown } | null) => {
  const [route1] = (payload?.route ?? '').split(':')
  if (route1 !== ROUTE_TIP && route1 !== ROUTE_ERROR) return
  const message = typeof payload?.data === 'string' ? payload.data : ''
  if (message) {
    // error 域 → 错误提示（红色样式）；tip 域 → 普通 tip
    const type = route1 === ROUTE_ERROR ? 'error' : 'tip'
    dispatchGlobalTip(type, route1, message)
  }
})

// ── 全局异常兜底事件：main 进程 fatal（uncaughtException/unhandledRejection）→ global-tip ──
ipcRenderer.on('global-tip', (_event, payload: { type?: 'error' | 'tip'; code?: string; message?: string } | null) => {
  if (!payload?.message) return
  dispatchGlobalTip(payload.type === 'tip' ? 'tip' : 'error', payload.code ?? 'fatal', payload.message)
})

// ── 插件事件转发：plugin:event → renderer（插件 emit() 的出口）──
ipcRenderer.on('plugin:event', (_event, payload: { pluginId: string; event: string; data?: unknown } | null) => {
  if (!payload) return
  try {
    window.dispatchEvent(new CustomEvent('plugin:event', {
      detail: { pluginId: payload.pluginId, event: payload.event, data: payload.data },
    }))
  } catch {
    // 事件转发失败静默（日志已由 main 侧打印）
  }
})

const api = {
  // ── Window Controls ──
  windowMinimize: () => inv('window:minimize'),
  windowMaximize: () => inv('window:maximize'),
  windowClose: () => inv('window:close'),
  isMaximized: () => inv('window:isMaximized'),
  /** 专注模式切换（窗口收窄到 375×812——临时突破 minWidth 768） */
  setPhoneMode: () => inv('window:phoneMode'),

  // Tool Center
  toolCenter: {
    initialize: () => inv('tool-center:initialize').then(unwrap),
    recheckMcp: () => inv('tool-center:recheck-mcp').then(unwrap),
    getState: () => inv('tool-center:get-state').then(unwrap),
    getMcpConfigs: () => inv('tool-center:get-mcp-configs').then(unwrap),
    upsertMcpServer: (config: { name: string; transport: 'stdio' | 'http'; command?: string; args?: string[]; url?: string; enabled: boolean }) => inv('tool-center:upsert-mcp-server', config).then(unwrap),
    removeMcpServer: (name: string) => inv('tool-center:remove-mcp-server', name).then(unwrap),
    collectEnv: () => inv('tool-center:collect-env').then(unwrap),
  },

  // Auto-update
  checkForUpdates: (manual = false) => inv('update:check', manual),
  installUpdate: () => inv('update:install'),
  getAppVersion: () => inv('app:version'),
  onUpdateStatus: (callback: (data: { status: string; message?: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { status: string; message?: string }) => callback(data)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.removeListener('update:status', handler)
  },
  onUpdateProgress: (callback: (data: { percent: number; speed?: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { percent: number; speed?: string }) => callback(data)
    ipcRenderer.on('update:progress', handler)
    return () => ipcRenderer.removeListener('update:progress', handler)
  },

  // ── Agent 会话（本地 TinkerAgent controller）──
  agent: {
    chat: (req: AgentSendRequest, onToken?: (evt: StreamToken) => void) => {
      if (onToken) {
        // 统一通道 + route/sessionId 过滤（chat:token 事件）
        const handler = (_event: Electron.IpcRendererEvent, payload: { route?: string; data?: StreamToken; sessionId?: string }) => {
          if (payload?.route === `${ROUTE_CHAT}:${EVT_CHAT_TOKEN}` && payload.sessionId === req.sessionId && payload.data) {
            onToken(payload.data)
          }
        }
        ipcRenderer.on(IPC_MESSAGE, handler)
        return inv('agent:chat', req).then(unwrap).finally(() => {
          ipcRenderer.removeListener(IPC_MESSAGE, handler)
        })
      }
      return inv('agent:chat', req).then(unwrap)
    },
    /** 统一消息入口：所有推送（route = '{一级}:{二级}'，客户端自行解析分发） */
    onRouteMessage: (callback: (payload: { route?: string; sessionId?: string; data?: unknown }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { route?: string; sessionId?: string; data?: unknown }) => {
        if (!payload?.route) return
        callback(payload)
      }
      ipcRenderer.on(IPC_MESSAGE, handler)
      return () => ipcRenderer.removeListener(IPC_MESSAGE, handler)
    },
    toolResult: (req: AgentToolResultRequestDTO) =>
      inv('agent:toolResult', req).then(unwrap),
    approval: (req: AgentApprovalRequestDTO) =>
      inv('agent:approval', req).then(unwrap),
    autoApprove: (conversationId: string) =>
      inv('agent:autoApprove', { conversationId }).then(unwrap),
    revoke: (profile: string, sessionId: string, messageId: string) =>
      inv('agent:revoke', {profile, sessionId, messageId}).then(unwrap),
    interrupt: (sessionId: string) =>
      inv('agent:interrupt', { sessionId }).then(unwrap),
    interruptNoPending: (sessionId: string) =>
      inv('agent:interruptNoPending', { sessionId }).then(unwrap),
    clearAll: (profile: string, sessionId: string) =>
      inv('agent:clearAll', {profile, sessionId}).then(unwrap),
  },

  // ── 会话（SessionController）──
  sessions: {
    list: (payload: ListSessionsQueryDTO) => inv('session:list', payload).then(unwrap),
    create: (payload: CreateSessionRequestDTO) => inv('session:create', payload).then(unwrap),
    update: (sessionId: string, title: string, profile: string) => inv('session:update', { sessionId, title, profile } satisfies UpdateSessionRequestDTO).then(unwrap),
    getYolo: (profile: string, sessionId: string) => inv('session:getYolo', { profile, sessionId }).then(unwrap),
    toggleYolo: (profile: string, sessionId: string) => inv('session:toggleYolo', { profile, sessionId }).then(unwrap),
    setReasoningDepth: (profile: string, sessionId: string, reasoningDepth: string) => inv('session:set-reasoning-depth', { profile, sessionId, reasoningDepth }).then(unwrap),
    getReasoningDepth: (profile: string, sessionId: string) => inv('session:get-reasoning-depth', { profile, sessionId }).then(unwrap),
    setNotifyComplete: (profile: string, sessionId: string, enabled: boolean) => inv('session:set-notify-complete', { profile, sessionId, enabled }).then(unwrap),
    contextStats: (profile: string, sessionId: string) => inv('session:context-stats', { profile, sessionId }).then(unwrap),
    compact: (profile: string, sessionId: string) => inv('session:compact', { profile, sessionId }).then(unwrap),
    /** 会话统计（数据面板：平均命中率 + memory 占用） */
    stats: (profile: string, sessionId: string) => inv('session:stats', { profile, sessionId }).then(unwrap),
    /** 数据面板整合（只读——上下文窗口/阈值/统计/memory 一口气给前端） */
    dashboard: (profile: string, sessionId: string) => inv('dashboard:get', { profile, sessionId }).then(unwrap),
  },

  // ── 消息（MessageController）──
  messages: {
    bySession: (sessionId: string, profile?: string, limit?: number, offset?: number) =>
      inv('message:bySession', { sessionId, profile, limit, offset } satisfies SessionMessagesQueryDTO).then(unwrap),
    byConversation: (conversationId: string, profile?: string) =>
      inv('message:byConversation', { conversationId, profile } satisfies ConversationMessagesQueryDTO).then(unwrap),
    deleteConversation: (conversationId: string, profile?: string) =>
      inv('message:deleteConversation', { conversationId, profile } satisfies DeleteConversationRequestDTO).then(unwrap),
  },

  // ── Agent 配置（AgentCrudController）──
  agents: {
    list: (payload?: { profile?: string; limit?: number; offset?: number }) => inv('agent-cfg:list', payload).then(unwrap),
    create: (payload: { profile: string; displayName?: string; description?: string; avatar?: string }) =>
      inv('agent-cfg:create', payload).then(unwrap),
    get: (profile: string) => inv('agent-cfg:get', profile).then(unwrap),
    update: (payload: { profile: string; displayName?: string; description?: string; avatar?: string; isActive?: boolean }) =>
      inv('agent-cfg:update', payload).then(unwrap),
    delete: (profile: string) => inv('agent-cfg:delete', profile).then(unwrap),
  },

  // ── Agent Mode（AgentModeController）──
  agentModes: {
    list: () => inv('agent-mode:list').then(unwrap),
    options: () => inv('agent-mode:options').then(unwrap),
    get: (id: string, version: string) => inv('agent-mode:get', { id, version }).then(unwrap),
    check: (profile: string) => inv('agent-mode:check', { profile }).then(unwrap),
  },

  // ── Agent 配置参数（AgentConfigController）──
  agentConfig: {
    get: (profile: string) => inv('agent-config:get', profile).then(unwrap),
    update: (payload: { profile: string; config: Record<string, unknown> }) => inv('agent-config:update', payload).then(unwrap),
    reset: (profile: string) => inv('agent-config:reset', profile).then(unwrap),
  },

  // ── 模型（ModelController；per-agent 操作 profile 必传）──
  models: {
    list: (profile: string) => inv('model:list', { profile }).then(unwrap),
    get: (profile: string, id: string) => inv('model:get', { profile, id }).then(unwrap),
    create: (profile: string, input: CreateCustomModelRequestDTO) => inv('model:create', { profile, ...input }).then(unwrap),
    update: (profile: string, input: UpdateCustomModelRequestDTO) => inv('model:update', { profile, ...input }).then(unwrap),
    delete: (profile: string, id: string) => inv('model:delete', { profile, id }).then(unwrap),
    test: (profile: string, id: string) => inv('model:test', { profile, id }).then(unwrap),
    listProviders: () => inv('model:list-providers').then(unwrap),
    getProvider: (id: string) => inv('model:get-provider', id).then(unwrap),
    fetchModels: (input: FetchModelsRequestDTO) => inv('model:fetch-models', input).then(unwrap),
    listScenes: (profile: string) => inv('model:list-scenes', { profile }).then(unwrap),
    bindScene: (profile: string, input: BindSceneModelRequestDTO) => inv('model:bind-scene', { profile, ...input }).then(unwrap),
    updateScene: (profile: string, input: UpdateSceneModelRequestDTO) => inv('model:update-scene', { profile, ...input }).then(unwrap),
    unbindScene: (profile: string, sceneId: string, modelId: string) => inv('model:unbind-scene', { profile, sceneId, modelId }).then(unwrap),
    reorderScenes: (profile: string, input: ReorderSceneBindingsRequestDTO) => inv('model:reorder-scenes', { profile, ...input }).then(unwrap),
  },

  // ── 技能（SkillController）──
  skills: {
    list: (payload?: SkillListQueryDTO) => inv('skill:list', payload).then(unwrap),
    byName: (name: string, profile?: string) => inv('skill:byName', { name, profile } satisfies SkillOpRequestDTO).then(unwrap),
    get: (id: string, profile?: string) => inv('skill:get', { id, profile } satisfies SkillOpRequestDTO).then(unwrap),
    deactivate: (id: string, profile?: string) => inv('skill:deactivate', { id, profile } satisfies SkillOpRequestDTO).then(unwrap),
    activate: (id: string, profile?: string) => inv('skill:activate', { id, profile } satisfies SkillOpRequestDTO).then(unwrap),
    categories: () => inv('skill:categories').then(unwrap),
    /** 安装/创建技能（结构化写入——render 层已解析；name/body 必填） */
    install: (payload: {
      profile?: string; name?: string; displayName?: string; description?: string; category?: string
      version?: string; author?: string; license?: string; platforms?: string; tags?: string
      dependencies?: string; requiresToolsets?: string; requiresTools?: string
      fallbackForToolsets?: string; fallbackForTools?: string; triggers?: string; triggerConditions?: string
      config?: string; envVars?: string; commands?: string; body?: string
      files?: Array<{ fileType: string; name?: string; content: string; sortOrder?: number }>
    }) => inv('skill:install', payload).then(unwrap),
    /** 选择技能文件并读取内容（技能管理页安装按钮用） */
    pickInstallFile: () => inv('skill:pick-install-file').then(unwrap),
    /** 编辑技能（全字段） */
    update: (payload: {
      id: string; profile?: string; displayName?: string; description?: string; category?: string
      version?: string; author?: string; license?: string
      tags?: string; platforms?: string; dependencies?: string; requiresToolsets?: string; requiresTools?: string
      fallbackForToolsets?: string; fallbackForTools?: string; triggers?: string; triggerConditions?: string
      config?: string; envVars?: string; commands?: string; envs?: string; body?: string
    }) => inv('skill:update', payload).then(unwrap),
    /** 删除技能（软删） */
    delete: (id: string, profile?: string) => inv('skill:delete', { id, profile }).then(unwrap),
    /** 按技能 id 查文件列表 */
    fileList: (skillId: string) => inv('skill:file-list', { skillId }).then(unwrap),
    /** 新增技能文件 */
    fileSave: (payload: { skillId: string; fileType: string; name?: string; content?: string; language?: string; sortOrder?: number }) => inv('skill:file-save', payload).then(unwrap),
    /** 更新技能文件 */
    fileUpdate: (payload: { id: number; fileType?: string; name?: string; content?: string; language?: string; sortOrder?: number }) => inv('skill:file-update', payload).then(unwrap),
    /** 删除技能文件 */
    fileDelete: (id: number) => inv('skill:file-delete', { id }).then(unwrap),
  },

  // ── 记忆管理（MemoryController——CRUD + 拖拽排序） ──
  memory: {
    list: (target: 'memory' | 'user', profile?: string) => inv('memory:list', { target, profile }).then(unwrap),
    add: (target: 'memory' | 'user', content: string, profile?: string) => inv('memory:add', { target, content, profile }).then(unwrap),
    update: (target: 'memory' | 'user', index: number, content: string, profile?: string) => inv('memory:update', { target, index, content, profile }).then(unwrap),
    remove: (target: 'memory' | 'user', index: number, profile?: string) => inv('memory:remove', { target, index, profile }).then(unwrap),
    reorder: (target: 'memory' | 'user', order: string[], profile?: string) => inv('memory:reorder', { target, order, profile }).then(unwrap),
  },

  // ── 账号初始化（AccountController，4 步向导）──
  account: {
    initStatus: () => inv('account:init-status').then(unwrap),
    initStepStatus: (step: number) => inv('account:init-step-status', { step }).then(unwrap),
    initStep1: (input: { displayName?: string }) => inv('account:init-step1', input).then(unwrap),
    initStep2: (config?: Record<string, unknown>) => inv('account:init-step2', { config }).then(unwrap),
    initStep3: (input: InitAccountParams) => inv('account:init-step3', input).then(unwrap),
    initStep4: (modelId: string) => inv('account:init-step4', { modelId }).then(unwrap),
  },

  // ── 提示词模块（PromptModuleController）──
  promptModules: {
    list: (profile: string) => inv('prompt-module:list', profile).then(unwrap),
    create: (name: string, content: string, profile: string, enabled?: boolean) =>
      inv('prompt-module:create', { name, content, profile, enabled } satisfies CreatePromptModuleRequestDTO).then(unwrap),
    update: (id: number, name: string, content: string, profile: string) =>
      inv('prompt-module:update', { id, name, content, profile } satisfies UpdatePromptModuleRequestDTO).then(unwrap),
    delete: (id: number, profile: string) => inv('prompt-module:delete', { id, profile } satisfies PromptModuleIdRequestDTO).then(unwrap),
    toggle: (id: number, enabled: boolean, profile: string) => inv('prompt-module:toggle', { id, enabled, profile } satisfies TogglePromptModuleRequestDTO).then(unwrap),
  },

  // ── 沙盒白名单（SandboxController）──
  sandbox: {
    listUrl: (profile?: string) => inv('sandbox:listUrl', profile).then(unwrap),
    addUrl: (payload: UrlWhitelistRequestDTO) => inv('sandbox:addUrl', payload).then(unwrap),
    deleteUrl: (id: number, profile?: string) => inv('sandbox:deleteUrl', { id, profile } satisfies WhitelistIdRequestDTO).then(unwrap),
    listPath: (profile?: string) => inv('sandbox:listPath', profile).then(unwrap),
    addPath: (payload: PathWhitelistRequestDTO) => inv('sandbox:addPath', payload).then(unwrap),
    deletePath: (id: number, profile?: string) => inv('sandbox:deletePath', { id, profile } satisfies WhitelistIdRequestDTO).then(unwrap),
  },

  // ── 工具配置（ToolController）──
  tools: {
    list: (payload?: { profile?: string; toolType?: string }) => inv('tool-config:list', payload ?? {}).then(unwrap),
    toggle: (toolName: string, disabled: boolean, profile?: string) =>
      inv('tool-config:toggle', { toolName, disabled, profile }).then(unwrap),
  },

  // ── 媒体附件（MediaController——pick-and-import 返回相对路径 media/xxx.ext；kind 限定文件类型）──
  media: {
    pickAndImport: (kind?: 'image' | 'audio' | 'video') => inv('media:pick-and-import', { kind }).then(unwrap),
    /** 多图选择（最多 5 张）→ 相对路径数组 */
    pickImages: () => inv('media:pick-images').then(unwrap),
    /** 媒体文件另存为（消息列表下载按钮）→ 保存路径 */
    saveAs: (relPath: string) => inv('media:save-as', { relPath }).then(unwrap),
  },

  // ── Web 工具 provider（WebProviderController——搜索/抓取插件接入）──
  webProvider: {
    list: (iface: 'web.search' | 'web.extract') => inv('web-provider:list', { iface }).then(unwrap),
    set: (payload: { iface: 'web.search' | 'web.extract'; pluginId?: string | null; fallback?: boolean }) =>
      inv('web-provider:set', payload).then(unwrap),
  },

  // ── Agent 语音工具 provider（AudioToolProviderController——text_to_speech / speech_to_text）──
  audioToolProvider: {
    list: (iface: 'tool.tts' | 'tool.stt') => inv('audio-tool-provider:list', { iface }).then(unwrap),
    set: (payload: { iface: 'tool.tts' | 'tool.stt'; providerId?: string | null; fallback?: boolean }) =>
      inv('audio-tool-provider:set', payload).then(unwrap),
  },

  // ── 插件系统 ──
  plugins: {
    list: () => inv('plugin:list').then(unwrap),
    toggle: (id: string, enabled: boolean) => inv('plugin:toggle', { id, enabled }).then(unwrap),
    // 探测性调用（配置页一次性加载多个——失败是预期——静默不弹全局错误）
    check: (id: string) => invSilent('plugin:check', { id }).then(unwrap),
    getStatus: (id: string) => invSilent('plugin:get-status', { id }).then(unwrap),
    getSchema: (id: string) => invSilent('plugin:get-schema', { id }).then(unwrap),
    getConfig: (id: string) => invSilent('plugin:get-config', { id }).then(unwrap),
    saveConfig: (id: string, patch: Record<string, unknown>) =>
      inv('plugin:save-config', { id, patch }).then(unwrap),
    /** 主进程资源下载（不依赖 Worker——配置页下载按钮） */
    downloadAssets: (id: string) => inv('plugin:download-assets', { id }).then(unwrap),
    /** 调用插件注册的 IPC 能力（plugin:<id>:<channel>） */
    invoke: (id: string, channel: string, payload?: unknown) =>
      inv(`plugin:${id}:${channel}`, payload ?? {}).then(unwrap),
    /** 文件选择对话框（配置表单 file 字段）——filters 可能是 Vue 响应式 Proxy，先序列化为普通对象 */
    pickFile: (filters?: { name: string; extensions: string[] }[]) =>
      inv('plugin:pick-file', {
        filters: filters ? JSON.parse(JSON.stringify(filters)) : undefined,
      }).then(unwrap),
    /** 安装插件：路径可为插件文件夹或 .zip 插件包（自动检测） */
    install: (path: string) => inv('plugin:install', { path }).then(unwrap),
    /** 在线安装（npm 包名） */
    installNpm: (pkg: string, registry?: string) => inv('plugin:install-npm', { pkg, registry }).then(unwrap),
    /** 卸载插件（删除插件及下载的模型） */
    uninstall: (id: string) => inv('plugin:uninstall', { id }).then(unwrap),
    /** 选择插件包：zip（文件对话框）或 folder（目录对话框） */
    pickInstallPackage: (kind?: 'zip' | 'folder') => inv('plugin:pick-install-package', { kind }).then(unwrap),
  },

  // ── 语音服务（系统固定接口，转发当前插件 provider） ──
  voice: {
    providers: () => inv('voice:providers').then(unwrap),
    getConfig: () => inv('voice:get-config').then(unwrap),
    setProvider: (patch: { sttProvider?: string | null; ttsProvider?: string | null }) =>
      inv('voice:set-provider', patch).then(unwrap),
    providerReady: (pluginId: string) => inv('voice:provider-ready', { pluginId }).then(unwrap),
    /** STT：录音（应用固有）后整段转文本 */
    sttTranscribe: (samples: Float32Array) =>
      inv('voice:stt:transcribe', { samples }).then(unwrap),
    /** TTS：文本 → 音频 base64 */
    ttsSpeak: (text: string) => inv('voice:tts:speak', { text }).then(unwrap),
  },

  // ── 通用设置（快捷键等全局键值配置） ──
  generalSettings: {
    get: () => inv('settings:general:get').then(unwrap),
    set: (key: string, value: string) => inv('settings:general:set', { key, value }).then(unwrap),
    reset: (key: string) => inv('settings:general:reset', { key }).then(unwrap),
  },

  // ── 事件记录（agent_events 容量/清空） ──
  events: {
    count: () => inv('settings:events:count').then(unwrap),
    clear: () => inv('settings:events:clear').then(unwrap),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronApi = typeof api
