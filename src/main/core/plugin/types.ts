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
  /** 旧字段别名（modelDeps——兼容早期插件——与 assetDeps 同构） */
  modelDeps?: AssetDep[]
  /** 静态配置 schema（JSON 方言——主进程直读——不依赖插件代码——
   *   Worker 死活不影响配置渲染；动态 schema（getConfigSchema）作为补充） */
  configSchema?: ConfigSchema
}

/** 资源依赖声明（模型/二进制/数据文件等任意资源） */
export interface AssetDep {
  name: string
  /** 下载后存放路径（相对插件目录） */
  dest: string
  sizeMB: number
  url: string
  /** 可选依赖（外部引擎自带/用户自管——静态检查跳过——不提示下载） */
  optional?: boolean
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
  /** 收敛后的单一状态（UI 直接渲染——后端统一计算）：
   *  unloaded=未加载 / disabled=已停用 / unready=未就绪 / registered=已注册 */
  status: 'unloaded' | 'disabled' | 'unready' | 'registered'
  /** 主进程静态声明式检查通过（manifest/入口/依赖/资源存在性——
   *   不执行插件代码——通过则配置页可开（含资源下载入口）——不依赖 Worker 存活） */
  configurable?: boolean
  detail?: string
}

/** 由 loaded/enabled/started 推导收敛状态（唯一计算入口——list/getStatus 共用） */
export function deriveStatus(s: { loaded: boolean; enabled: boolean; started?: boolean }): PluginStatus['status'] {
  if (!s.loaded) return 'unloaded'
  if (!s.enabled) return 'disabled'
  if (!s.started) return 'unready'
  return 'registered'
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

/* ── 插件运行态（主进程内部——plugin-manager/host-worker 共用） ── */

/** 插件运行记录（注册表项——内置插件 worker 为 null——main 直跑） */
export interface PluginRecord {
  manifest: PluginManifest
  api: PluginApi | null
  ctx: PluginContext | null
  /** 持久化的启用意图（config.json.enabled） */
  enabled: boolean
  /** 运行时实际注册状态（自检通过 + start 成功 → 加入 provider 清单） */
  started: boolean
  error?: string
  /** 外部插件宿主 Worker（内置插件为 null——main 直跑） */
  worker: import('worker_threads').Worker | null
}

/** config.json 结构：启停状态 + 插件配置合一个文件 */
export interface PluginConfigFile {
  enabled: boolean
  config: Record<string, unknown>
}

/** Worker 宿主启动数据（plugin-host-worker 的 workerData） */
export interface HostData {
  pluginDir: string
  entry: string
  manifest: PluginManifest
  configFile: string
}

/** 系统开放接口定义（插件 manifest.systemInterfaces[].id 必须精确匹配） */
export interface SystemInterfaceDef {
  /** 接口 id（插件 manifest.systemInterfaces[].id 必须精确匹配） */
  id: string
  /** 展示名（系统设置页） */
  name: string
  /** 描述 */
  description?: string
  /** 契约：实现该接口必须注册的插件频道（PluginManager 注册时校验）——空串 = 无契约频道（工具直连 provider） */
  requiredChannel: string
  /** 契约：实现该接口必须注册的可选频道（如 models:status 模型管理） */
  optionalChannels?: string[]
}


/* ── 安装器（PluginInstaller） ── */

/** 安装阶段 */
export type InstallStage = 'validate' | 'copy' | 'deps' | 'assets' | 'register'

/** 安装会话（分步状态——内存态——重启丢弃） */
export interface InstallSession {
  sessionId: string
  srcDir: string
  manifest: PluginManifest | null
  pluginDir: string
  /** 用户选择跳过的资源（dest 路径） */
  skipAssets: string[]
  stages: Record<InstallStage, 'pending' | 'running' | 'done' | 'failed'>
  error?: string
  /** npm 临时目录（startNpm 创建——copy 完成后清理） */
  tmpDir?: string
  /** 来源：npm 在线 / local 本地 */
  sourceType?: 'npm' | 'local'
  /** npm tarball 下载地址（startNpm 查询——download 步骤下载） */
  tarballUrl?: string
  /** tarball 解压后大小（registry 元数据——进度用） */
  tarballSize?: number
}

/** 安装器依赖（manager 注入） */
export interface InstallerDeps {
  pluginsDir: string
  /** 创建并注册 Plugin（validate 后调用——安装器完成文件操作后交 manager） */
  registerPlugin: (srcDir: string) => PluginRecord
  /** 查询插件是否已安装（安装前校验——同 id 已装 → 拒绝） */
  hasPlugin: (id: string) => boolean
}

/* ── Plugin 活动对象 ── */

/** PluginHost 需要 manager 提供的回调（避免反向依赖） */
export interface PluginHostHooks {
  /** Worker ready：注册插件声明的 IPC 通道（manager 安全接线） */
  onReady: (record: PluginRecord, channels: string[]) => void
  /** 插件 ctx.emit 事件转发 renderer */
  onEmit: (pluginId: string, event: string, data?: unknown) => void
  /** Worker fatal（插件加载/执行致命错误） */
  onFatal: (record: PluginRecord, error: string) => void
}

/** Plugin 依赖（manager 注入——共享实例） */
export interface PluginDeps {
  host: import('./plugin-host').PluginHost
  /** 注册/注销 provider（manager 提供） */
  registerProvider: (plugin: PluginRecord) => void
  unregisterProvider: (plugin: PluginRecord) => void
  /** 注册插件声明的 IPC 通道（manager 安全接线） */
  registerIpc: (pluginId: string, channel: string, handler: (payload: unknown) => unknown) => void
  /** 查询插件是否已注册某通道（接口契约校验用） */
  hasChannel: (pluginId: string, channel: string) => boolean
  /** 插件事件转发 renderer */
  forwardEvent: (pluginId: string, event: string, data?: unknown) => void
}
