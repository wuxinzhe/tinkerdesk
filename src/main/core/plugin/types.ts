/**
 * plugin/types.ts — TinkerDesk 插件协议（v1）
 *
 * 插件形态：应用外独立目录（%APPDATA%/tinkerdesk/plugins/<pluginId>/）
 *   manifest.json + index.js（入口，main 进程加载）+ node_modules（自带依赖）+ models/
 * 应用不打包任何插件代码。
 */

/** 插件元数据（manifest.json，与目录同名校验） */
export interface PluginManifest {
  /** 插件 id（小写连字符，= 目录名 = manifest.id） */
  id: string
  /** 展示名 */
  name: string
  version: string
  /** 协议版本（当前 1） */
  apiVersion: number
  /** 入口文件（相对插件目录，CommonJS） */
  entry: string
  /** 需要 main 进程权限（native addon / 系统能力） */
  requiresMain?: boolean
  /** 能力标签：如 ["stt", "tts"]（设置页展示用） */
  capabilities?: string[]
  /** 实现的系统开放接口（多 provider 抽象的关键声明）：
   *   { id: 'voice.stt', version: 1 } → 应用按固定契约调用 plugin:<id>:stt:transcribe
   *   { id: 'voice.tts', version: 1 } → 应用按固定契约调用 plugin:<id>:tts:speak
   */
  systemInterfaces?: { id: string; version: number }[]
  /** 内置插件标记（代码注册——不出现在 plugins/ 目录、不可卸载） */
  builtin?: boolean
  /** 权限声明：如 ["mic", "audio-output"] */
  permissions?: string[]
  /** 描述 */
  description?: string
  /** 作者（来源标注——列表展示用） */
  author?: string
  /** 项目主页（来源标注——列表展示链接） */
  homepage?: string
  /** 发布者（发布渠道标识） */
  publisher?: string
  /** 资源依赖（模型/二进制/数据文件——URL 直链下载到 dest） */
  assetDeps?: AssetDep[]
}

/** 资源依赖声明（模型/二进制/数据文件等任意资源） */
export interface AssetDep {
  name: string
  /** 下载后存放路径（相对插件目录） */
  dest: string
  sizeMB: number
  url: string
}

/* ── 配置 Schema（动态表单渲染协议，UI 不写死插件字段） ── */

export type ConfigFieldType = 'string' | 'secret' | 'number' | 'boolean' | 'select' | 'textarea' | 'file'

export interface ConfigField {
  type: ConfigFieldType
  title: string
  description?: string
  default?: unknown
  placeholder?: string
  required?: boolean
  /** number 专用 */
  min?: number
  max?: number
  step?: number
  /** select 专用 */
  options?: { label: string; value: string }[]
  /** file 专用：文件选择对话框过滤器（[{ name, extensions: ['wav','mp3'] }]） */
  filters?: { name: string; extensions: string[] }[]
}

export interface ConfigSchema {
  type: 'object'
  properties: Record<string, ConfigField>
}

/* ── 插件运行时契约 ── */

/** 插件上下文（应用注入） */
export interface PluginContext {
  pluginId: string
  /** 插件目录（读模型/资源） */
  configDir: string
  /** 插件 manifest（assetDeps 等） */
  getManifest(): PluginManifest
  /** 插件 → 应用事件（转发 renderer，如 stt:on-text） */
  emit(event: string, data?: unknown): void
  /** 注册 IPC 能力（renderer 侧调用 plugin:<id>:<channel>） */
  registerIpc(channel: string, handler: (payload: unknown) => unknown): void
  /** 读取应用托管的插件配置 */
  getConfig<T = Record<string, unknown>>(): T
  /** 更新插件配置（按字段 patch） */
  setConfig(patch: Record<string, unknown>): void
}

/** 插件状态 */
export interface PluginStatus {
  loaded: boolean
  /** 持久化的启用意图（config.json.enabled） */
  enabled: boolean
  /** 运行时实际注册状态（自检通过并 start → 加入 provider 清单） */
  started?: boolean
  detail?: string
}

/** 自检单项：name 检查项名称；action 引导动作（UI 据此提供"去下载/去配置"按钮） */
export interface PluginCheckItem {
  name: string
  ok: boolean
  hint?: string
  action?: 'download-models' | 'open-config'
}

/** 自检结果：启用插件前必须全部通过 */
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

/**
 * 插件能力 API（入口 init() 返回）
 * check() 为强制实现：启用前自检（配置完整性/模型就绪等），ok=false 时应用拒绝启用并引导修复
 */
export interface PluginApi {
  check(): PluginCheckResult
  start?(): void | Promise<void>
  stop?(): void | Promise<void>
  dispose?(): void | Promise<void>
  getStatus?(): PluginStatus | Promise<PluginStatus>
  /** 配置 Schema（动态——可按运行时状态返回不同选项） */
  getConfigSchema?(): ConfigSchema
}

/** 插件入口（index.js 导出的契约） */
export interface TinkerPlugin {
  init(ctx: PluginContext): PluginApi
}

/* ── 应用侧视图模型 ── */

/** 插件列表项（renderer 展示） */
export interface PluginInfo {
  manifest: PluginManifest
  status: PluginStatus
}
