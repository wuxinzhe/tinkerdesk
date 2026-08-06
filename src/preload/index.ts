import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentSendRequest,
  StreamToken,
  AgentMessageVO,
  AgentApprovalEvent,
  AgentToolResultRequestDTO,
  AgentApprovalRequestDTO,
  AgentRevokeRequestDTO,
  CreateSessionRequestDTO,
  UpdateSessionRequestDTO,
  ListSessionsQueryDTO,
  SessionMessagesQueryDTO,
  ConversationMessagesQueryDTO,
  DeleteConversationRequestDTO,
  ToolListQueryDTO,
  ToggleToolRequestDTO,
  SkillListQueryDTO,
  SkillOpRequestDTO,
  CreatePromptModuleRequestDTO,
  UpdatePromptModuleRequestDTO,
  PromptModuleIdRequestDTO,
  TogglePromptModuleRequestDTO,
  UrlWhitelistRequestDTO,
  PathWhitelistRequestDTO,
  WhitelistIdRequestDTO,
} from '../main/controller/types'
import type { CreateCustomModelRequestDTO, UpdateCustomModelRequestDTO, BindSceneModelRequestDTO, UpdateSceneModelRequestDTO, ReorderSceneBindingsRequestDTO, FetchModelsRequestDTO, InitRequestDTO as InitAccountParams } from '../main/service/types'

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
      console.error(`[IPC] ${channel} ✗ ${ms}ms`, req, '→', r?.error ?? '')
      dispatchGlobalTip('error', channel, r?.error ?? '操作失败，请重试')
    } else {
      const resp = truncateLog(redactArgs(r?.data))
      console.log(`[IPC] ${channel} ✓ ${ms}ms`, req, '→', resp)
    }
    return res as T
  }).catch((e: Error) => {
    console.error(`[IPC] ${channel} ✗ ${Date.now() - t}ms`, req, '→', e)
    dispatchGlobalTip('error', channel, e.message || '操作失败，请重试')
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

// ── main → renderer 通知出口：agent:queueTip（ElectronEventSender.sendTips）──
// 本地单客户端：main 的 tips 提示（如"消息已入队"）经此频道推送 → 统一进 GlobalTipToast（tip 样式）
ipcRenderer.on('agent:queueTip', (_event, payload: { type?: string; message?: string } | null) => {
  const message = payload?.message ?? ''
  if (message) {
    dispatchGlobalTip('tip', payload?.type ?? 'TIP', message)
  }
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

  // Tool Center
  toolCenter: {
    initialize: () => inv('tool-center:initialize'),
    recheckMcp: () => inv('tool-center:recheck-mcp'),
    getState: () => inv('tool-center:get-state'),
    getMcpConfigs: () => inv('tool-center:get-mcp-configs'),
    upsertMcpServer: (config: {name: string; transport: 'stdio' | 'http'; command?: string; args?: string[]; url?: string; enabled: boolean}) => inv('tool-center:upsert-mcp-server', config),
    removeMcpServer: (name: string) => inv('tool-center:remove-mcp-server', name),
    collectEnv: () => inv('tool-center:collect-env'),
  },

  // Auto-update
  checkForUpdates: (manual = false) => inv('update:check', manual),
  installUpdate: () => inv('update:install'),
  getAppVersion: () => inv('app:version'),
  onUpdateStatus: (callback: (data: {status: string; message?: string}) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: {status: string; message?: string}) => callback(data)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.removeListener('update:status', handler)
  },
  onUpdateProgress: (callback: (data: {percent: number; speed?: string}) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: {percent: number; speed?: string}) => callback(data)
    ipcRenderer.on('update:progress', handler)
    return () => ipcRenderer.removeListener('update:progress', handler)
  },

  // ── Agent 会话（本地 AgentLoop controller）──
  agent: {
    chat: (req: AgentSendRequest, onToken?: (evt: StreamToken) => void) => {
      if (onToken) {
        const handler = (_event: Electron.IpcRendererEvent, evt: StreamToken) => onToken(evt)
        ipcRenderer.on('agent:token', handler)
        return inv('agent:chat', req).then(unwrap).finally(() => {
          ipcRenderer.removeListener('agent:token', handler)
        })
      }
      return inv('agent:chat', req).then(unwrap)
    },
    toolResult: (profile: string, sessionId: string, toolCallId: string, result: string) =>
      inv('agent:toolResult', {profile, sessionId, toolCallId, result}).then(unwrap),
    approval: (profile: string, sessionId: string, toolCallId: string, approved: boolean) =>
      inv('agent:approval', {profile, sessionId, toolCallId, approved}).then(unwrap),
    revoke: (profile: string, sessionId: string, messageId: string) =>
      inv('agent:revoke', {profile, sessionId, messageId}).then(unwrap),
    interrupt: (profile: string, sessionId: string) =>
      inv('agent:interrupt', {profile, sessionId}).then(unwrap),
    clearAll: (profile: string, sessionId: string) =>
      inv('agent:clearAll', {profile, sessionId}).then(unwrap),
    onApprovalRequest: (callback: (payload: AgentApprovalEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: AgentApprovalEvent) => callback(payload)
      ipcRenderer.on('agent:approvalRequest', handler)
      return () => ipcRenderer.removeListener('agent:approvalRequest', handler)
    }
  },

  // ── 会话（SessionController）──
  sessions: {
    list: (payload: ListSessionsQueryDTO) => inv('session:list', payload).then(unwrap),
    create: (payload: CreateSessionRequestDTO) => inv('session:create', payload).then(unwrap),
    update: (sessionId: string, title: string, profile: string) => inv('session:update', {sessionId, title, profile} satisfies UpdateSessionRequestDTO).then(unwrap),
    getYolo: (profile: string, sessionId: string) => inv('session:getYolo', {profile, sessionId}).then(unwrap),
    toggleYolo: (profile: string, sessionId: string) => inv('session:toggleYolo', {profile, sessionId}).then(unwrap),
  },

  // ── 消息（MessageController）──
  messages: {
    bySession: (sessionId: string, profile?: string, limit?: number, offset?: number) =>
      inv('message:bySession', {sessionId, profile, limit, offset} satisfies SessionMessagesQueryDTO).then(unwrap),
    byConversation: (conversationId: string, profile?: string) =>
      inv('message:byConversation', {conversationId, profile} satisfies ConversationMessagesQueryDTO).then(unwrap),
    deleteConversation: (conversationId: string, profile?: string) =>
      inv('message:deleteConversation', {conversationId, profile} satisfies DeleteConversationRequestDTO).then(unwrap),
  },

  // ── Agent 配置（AgentCrudController）──
  agents: {
    list: (payload?: {profile?: string}) => inv('agent-cfg:list', payload).then(unwrap),
    create: (payload: {profile: string; displayName?: string; description?: string; avatar?: string}) =>
      inv('agent-cfg:create', payload).then(unwrap),
    get: (profile: string) => inv('agent-cfg:get', profile).then(unwrap),
    update: (payload: {profile: string; displayName?: string; description?: string; avatar?: string; isActive?: boolean}) =>
      inv('agent-cfg:update', payload).then(unwrap),
    delete: (profile: string) => inv('agent-cfg:delete', profile).then(unwrap),
  },

  // ── Agent Mode（AgentModeController）──
  agentModes: {
    list: () => inv('agent-mode:list').then(unwrap),
    options: () => inv('agent-mode:options').then(unwrap),
    get: (id: string, version: string) => inv('agent-mode:get', {id, version}).then(unwrap),
    check: (profile: string) => inv('agent-mode:check', {profile}).then(unwrap),
  },

  // ── Agent 配置参数（AgentConfigController）──
  agentConfig: {
    get: (profile: string) => inv('agent-config:get', profile).then(unwrap),
    update: (payload: {profile: string; config: Record<string, unknown>}) => inv('agent-config:update', payload).then(unwrap),
    reset: (profile: string) => inv('agent-config:reset', profile).then(unwrap),
  },

  // ── 模型（ModelController；per-agent 操作 profile 必传）──
  models: {
    list: (profile: string) => inv('model:list', {profile}).then(unwrap),
    get: (profile: string, id: string) => inv('model:get', {profile, id}).then(unwrap),
    create: (profile: string, input: CreateCustomModelRequestDTO) => inv('model:create', {profile, ...input}).then(unwrap),
    update: (profile: string, input: UpdateCustomModelRequestDTO) => inv('model:update', {profile, ...input}).then(unwrap),
    delete: (profile: string, id: string) => inv('model:delete', {profile, id}).then(unwrap),
    test: (profile: string, id: string) => inv('model:test', {profile, id}).then(unwrap),
    listProviders: () => inv('model:list-providers').then(unwrap),
    getProvider: (id: string) => inv('model:get-provider', id).then(unwrap),
    fetchModels: (input: FetchModelsRequestDTO) => inv('model:fetch-models', input).then(unwrap),
    listScenes: (profile: string) => inv('model:list-scenes', {profile}).then(unwrap),
    bindScene: (profile: string, input: BindSceneModelRequestDTO) => inv('model:bind-scene', {profile, ...input}).then(unwrap),
    updateScene: (profile: string, input: UpdateSceneModelRequestDTO) => inv('model:update-scene', {profile, ...input}).then(unwrap),
    unbindScene: (profile: string, sceneId: string, priority: number) => inv('model:unbind-scene', {profile, sceneId, priority}).then(unwrap),
    reorderScenes: (profile: string, input: ReorderSceneBindingsRequestDTO) => inv('model:reorder-scenes', {profile, ...input}).then(unwrap),
  },

  // ── 技能（SkillController）──
  skills: {
    list: (payload?: SkillListQueryDTO) => inv('skill:list', payload).then(unwrap),
    byName: (name: string, profile?: string) => inv('skill:byName', {name, profile} satisfies SkillOpRequestDTO).then(unwrap),
    get: (id: string, profile?: string) => inv('skill:get', {id, profile} satisfies SkillOpRequestDTO).then(unwrap),
    deactivate: (id: string, profile?: string) => inv('skill:deactivate', {id, profile} satisfies SkillOpRequestDTO).then(unwrap),
    activate: (id: string, profile?: string) => inv('skill:activate', {id, profile} satisfies SkillOpRequestDTO).then(unwrap),
    categories: () => inv('skill:categories').then(unwrap),
  },

  // ── 账号初始化（AccountController，4 步向导）──
  account: {
    initStatus: () => inv('account:init-status').then(unwrap),
    initStepStatus: (step: number) => inv('account:init-step-status', {step}).then(unwrap),
    initStep1: (input: {displayName?: string}) => inv('account:init-step1', input).then(unwrap),
    initStep2: (config?: Record<string, unknown>) => inv('account:init-step2', {config}).then(unwrap),
    initStep3: (input: InitAccountParams) => inv('account:init-step3', input).then(unwrap),
    initStep4: (modelId: string) => inv('account:init-step4', {modelId}).then(unwrap),
  },

  // ── 提示词模块（PromptModuleController）──
  promptModules: {
    list: (profile: string) => inv('prompt-module:list', profile).then(unwrap),
    create: (name: string, content: string, profile: string, enabled?: boolean) =>
      inv('prompt-module:create', {name, content, profile, enabled} satisfies CreatePromptModuleRequestDTO).then(unwrap),
    update: (id: number, name: string, content: string, profile: string) =>
      inv('prompt-module:update', {id, name, content, profile} satisfies UpdatePromptModuleRequestDTO).then(unwrap),
    delete: (id: number, profile: string) => inv('prompt-module:delete', {id, profile} satisfies PromptModuleIdRequestDTO).then(unwrap),
    toggle: (id: number, enabled: boolean, profile: string) => inv('prompt-module:toggle', {id, enabled, profile} satisfies TogglePromptModuleRequestDTO).then(unwrap),
  },

  // ── 沙盒白名单（SandboxController）──
  sandbox: {
    listUrl: (profile?: string) => inv('sandbox:listUrl', profile).then(unwrap),
    addUrl: (payload: UrlWhitelistRequestDTO) => inv('sandbox:addUrl', payload).then(unwrap),
    deleteUrl: (id: number, profile?: string) => inv('sandbox:deleteUrl', {id, profile} satisfies WhitelistIdRequestDTO).then(unwrap),
    listPath: (profile?: string) => inv('sandbox:listPath', profile).then(unwrap),
    addPath: (payload: PathWhitelistRequestDTO) => inv('sandbox:addPath', payload).then(unwrap),
    deletePath: (id: number, profile?: string) => inv('sandbox:deletePath', {id, profile} satisfies WhitelistIdRequestDTO).then(unwrap),
  },

  // ── 工具配置（ToolController）──
  tools: {
    list: (profile?: string) => inv('tool-config:list', {profile} satisfies ToolListQueryDTO).then(unwrap),
    toggle: (toolName: string, disabled: boolean, profile?: string) =>
      inv('tool-config:toggle', {toolName, disabled, profile} satisfies ToggleToolRequestDTO).then(unwrap),
  },

  // ── 插件系统 ──
  plugins: {
    list: () => inv('plugin:list').then(unwrap),
    toggle: (id: string, enabled: boolean) => inv('plugin:toggle', {id, enabled}).then(unwrap),
    check: (id: string) => inv('plugin:check', {id}).then(unwrap),
    getStatus: (id: string) => inv('plugin:get-status', {id}).then(unwrap),
    getSchema: (id: string) => inv('plugin:get-schema', {id}).then(unwrap),
    getConfig: (id: string) => inv('plugin:get-config', {id}).then(unwrap),
    saveConfig: (id: string, patch: Record<string, unknown>) =>
      inv('plugin:save-config', {id, patch}).then(unwrap),
    /** 调用插件注册的 IPC 能力（plugin:<id>:<channel>） */
    invoke: (id: string, channel: string, payload?: unknown) =>
      inv(`plugin:${id}:${channel}`, payload ?? {}).then(unwrap),
    /** 文件选择对话框（配置表单 file 字段） */
    pickFile: (filters?: { name: string; extensions: string[] }[]) =>
      inv('plugin:pick-file', { filters }).then(unwrap),
  },

  // ── 语音服务（系统固定接口，转发当前插件 provider） ──
  voice: {
    providers: () => inv('voice:providers').then(unwrap),
    getConfig: () => inv('voice:get-config').then(unwrap),
    setProvider: (patch: { sttProvider?: string | null; ttsProvider?: string | null }) =>
      inv('voice:set-provider', patch).then(unwrap),
    providerReady: (pluginId: string) => inv('voice:provider-ready', {pluginId}).then(unwrap),
    /** STT：录音（应用固有）后整段转文本 */
    sttTranscribe: (samples: Float32Array) =>
      inv('voice:stt:transcribe', {samples}).then(unwrap),
    /** TTS：文本合成 → audio data URL */
    ttsSpeak: (text: string) => inv('voice:tts:speak', {text}).then(unwrap),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronApi = typeof api
