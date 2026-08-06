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
  /** 能力声明：如 ["stt", "tts"] */
  capabilities?: string[]
  /** 权限声明：如 ["mic", "audio-output"] */
  permissions?: string[]
  /** 描述 */
  description?: string
  /** 模型依赖（设置页引导下载） */
  modelDeps?: ModelDep[]
}

/** 模型依赖声明 */
export interface ModelDep {
  name: string
  /** 下载后存放路径（相对插件目录） */
  dest: string
  sizeMB: number
  url: string
}

/* ── 配置 Schema（动态表单渲染协议，UI 不写死插件字段） ── */

export type ConfigFieldType = 'string' | 'secret' | 'number' | 'boolean' | 'select' | 'textarea'

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
  /** 插件 manifest（modelDeps 等） */
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
  enabled: boolean
  detail?: string
}

/** 插件能力 API（入口 init() 返回） */
export interface PluginApi {
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
