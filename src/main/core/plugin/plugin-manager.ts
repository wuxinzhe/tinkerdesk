/**
 * plugin-manager.ts — 插件管理器（纯注册表——维护性工作）
 *
 * 职责边界（按用户拍板）：
 *   manager = 注册表增删查 + 配置管理 + IPC 接线
 *   installer = 安装/资源下载/卸载（PluginInstaller——独立子系统）
 *   Plugin = 活动对象（每插件一个——封装 host/worker 执行——manager 查询后直接操作）
 *
 * 调用方流程：manager.getPlugin(id) → plugin.check()/start()/invoke()...
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { handleTrusted } from '../../security/ipc-guard'
import { PluginHost } from './plugin-host'
import { PluginInstaller } from './plugin-installer'
import { Plugin } from './plugin'
import { readConfigFile, writeConfigFile, persistEnabled } from './plugin-store'
import { matchSystemInterfaces } from './system-interfaces'
import type { PluginApi, PluginCheckResult, PluginConfigFile, PluginContext, PluginManifest, PluginRecord, PluginStatus, PluginInfo, ToggleResult } from './types'

/** 插件管理器（纯注册表——维护性工作） */
export class PluginManager {
  private readonly pluginsDir: string
  private readonly registry = new Map<string, Plugin>()
  /** 插件注册的 IPC handler（channel → handler），供应用内部转发（接口转发等） */
  private readonly ipcHandlers = new Map<string, (payload: unknown) => unknown>()
  /** renderer 事件转发目标（由 index.ts 注入 mainWindow.webContents） */
  private emitTarget: Electron.WebContents | null = null
  /** Worker 宿主（通用机制——共享实例） */
  private readonly host: PluginHost
  /** 系统开放接口的 provider 注册表：interfaceId → 已注册（started）插件 id 列表 */
  private readonly interfaceProviders = new Map<string, string[]>()
  /** 安装器（独立子系统——安装/资源/卸载） */
  private readonly installer: PluginInstaller
  constructor() {
    // host 先建（hooks 闭包延迟调用 loader——loader 随后赋值——消息到来时已就绪）
    this.host = new PluginHost({
      onReady: (record, channels) => (record as Plugin).onWorkerReady(channels),
      onEmit: (pluginId, event, data) => this.forwardEvent(pluginId, event, data),
      onFatal: (record, error) => (record as Plugin).onWorkerFatal(error),
    })
    this.pluginsDir = join(app.getPath('userData'), 'plugins')
    this.installer = new PluginInstaller({
      pluginsDir: this.pluginsDir,
      hasPlugin: (id) => this.registry.has(id),
      registerPlugin: (srcDir) => {
        // 安装完成：从安装目录加载并注册（同 loadAll 流程）
        const destDir = join(this.pluginsDir, JSON.parse(readFileSync(join(srcDir, 'manifest.json'), 'utf-8')).id as string)
        this.loadPlugin(destDir)
        const record = this.registry.get(JSON.parse(readFileSync(join(srcDir, 'manifest.json'), 'utf-8')).id as string)
        if (!record) throw new Error('插件注册失败')
        return record
      },
    })
    mkdirSync(this.pluginsDir, { recursive: true })
  }

  /** 注入事件转发目标（窗口创建后调用） */
  setEmitTarget(wc: Electron.WebContents | null): void {
    this.emitTarget = wc
  }

  /** 事件转发目标（controller 推进度等用） */
  getEmitTarget(): Electron.WebContents | null {
    return this.emitTarget
  }

  /** 启动时扫描并加载全部插件（失败不阻塞，错误记录到插件状态） */
  loadAll(): void {
    if (!existsSync(this.pluginsDir)) return
    for (const name of readdirSync(this.pluginsDir)) {
      const dir = join(this.pluginsDir, name)
      if (name.startsWith('.') || name.startsWith('_')) continue
      try {
        if (!existsSync(join(dir, 'manifest.json'))) continue
        this.loadPlugin(dir)
      } catch (e) {
        console.error(`[plugin] 加载失败 ${name}:`, (e as Error).message)
      }
    }
  }

  /** 注册内置插件（代码注册——main 直跑——不可卸载） */
  registerBuiltinPlugin(opts: { manifest: PluginManifest; plugin: { init: (ctx: PluginContext) => PluginApi } }): void {
    const { manifest, plugin } = opts
    const pluginObj = new Plugin(manifest, join(this.pluginsDir, manifest.id), this.pluginDeps())
    const configFile = join(this.pluginsDir, manifest.id, 'config.json')
    const firstRun = !existsSync(configFile)
    try {
      pluginObj.loadBuiltin(configFile, plugin)
    } catch (e) {
      throw new Error((e as Error).message)
    }
    if (firstRun) pluginObj.persistEnabled()
    this.registry.set(manifest.id, pluginObj)
    console.log(`[plugin] 已加载内置 ${manifest.id}@${manifest.version} (${manifest.capabilities?.join(',') ?? '无能力'})`)
    if (pluginObj.enabled) {
      pluginObj.autoRegister()
    }
  }


  /** 插件列表（renderer 展示——含静态检查状态） */
  list(): PluginInfo[] {
    return Array.from(this.registry.values()).map((r) => {
      const staticOk = this.staticCheck(r)
      return {
        manifest: r.manifest,
        status: {
          loaded: r.api !== null,
          enabled: r.enabled,
          started: r.started,
          configurable: staticOk.ok,
          detail: staticOk.ok ? r.error : staticOk.reason,
        },
      }
    })
  }

  /** 查询单个插件（调用方入口——返回 Plugin 活动对象） */
  getRecord(id: string): PluginRecord | null {
    return this.registry.get(id) ?? null
  }

  /** 插件列表（含启用态过滤） */
  getProviders(interfaceId: string): PluginRecord[] {
    const ids = this.interfaceProviders.get(interfaceId) ?? []
    return ids.map((id) => this.registry.get(id)).filter((r): r is Plugin => !!r) as unknown as PluginRecord[]
  }

  /** 插件注册到其声明接口的 provider 清单 */
  private registerProviders(record: PluginRecord): void {
    for (const def of matchSystemInterfaces(record.manifest.systemInterfaces)) {
      const list = this.interfaceProviders.get(def.id) ?? []
      if (!list.includes(record.manifest.id)) {
        list.push(record.manifest.id)
        this.interfaceProviders.set(def.id, list)
        console.log(`[plugin] ${record.manifest.id} → 注册为接口 ${def.id} 的 provider`)
      }
    }
  }

  /** 插件从 provider 清单注销 */
  private unregisterProviders(record: PluginRecord): void {
    for (const def of matchSystemInterfaces(record.manifest.systemInterfaces)) {
      const list = this.interfaceProviders.get(def.id)
      if (list) {
        const next = list.filter((id) => id !== record.manifest.id)
        if (next.length > 0) this.interfaceProviders.set(def.id, next)
        else this.interfaceProviders.delete(def.id)
      }
    }
  }

  /** 查询插件（controller 等调用方入口——兼容名） */
  getPlugin(id: string): PluginRecord | null {
    return this.getRecord(id)
  }

  /** 启用/停用（启停由 Plugin 活动对象执行） */
  async toggle(id: string, enabled: boolean): Promise<ToggleResult> {
    const record = this.registry.get(id)
    if (!record) return { ok: false, enabled }
    record.enabled = enabled
    persistEnabled(record)
    if (!enabled) {
      if (record.worker) {
        void Promise.resolve(record.api?.stop?.()).catch(() => {})
        this.terminateWorker(record)
      } else {
        record.api?.dispose?.()
      }
      record.started = false
      this.unregisterProviders(record)
      return { ok: true, enabled }
    }
    // 启用：重新加载/自检注册
    try {
      this.autoRegister(record)
      return { ok: true, enabled }
    } catch {
      return { ok: false, enabled }
    }
  }

  /** 卸载插件（删除目录——Worker 先释放） */
  uninstallPlugin(id: string): void {
    const record = this.registry.get(id)
    if (!record) throw new Error(`插件不存在: ${id}`)
    if (record.manifest.builtin) {
      throw new Error(`内置插件不可卸载: ${id}`)
    }
    if (record.started) {
      void Promise.resolve(record.api?.stop?.()).catch(() => {})
      this.unregisterProviders(record)
      record.started = false
      record.enabled = false
    }
    if (record.worker) {
      this.terminateWorker(record)
    }
    this.installer.uninstall(id)
    this.registry.delete(id)
    console.log(`[plugin] 已卸载 ${id}`)
  }

  /** 从路径安装插件（目录或 .zip）——委托安装器 */
  async installFromPath(src: string): Promise<PluginInfo> {
    const record = await this.installer.install(src)
    return {
      manifest: record.manifest,
      status: { loaded: record.api !== null, enabled: record.enabled, started: record.started },
    }
  }

  /** 分步安装：开始会话（npm 包名——pack 下载 + validate） */
  startInstallNpm(pkg: string, opts?: { registry?: string }): Promise<import('./types').InstallSession> {
    return this.installer.startNpm(pkg, opts)
  }

  /** 分步安装：开始会话（本地路径——validate） */
  startInstallPath(src: string): import('./types').InstallSession {
    return this.installer.start(src)
  }

  /** 分步安装：查询会话 */
  getInstallSession(sessionId: string): import('./types').InstallSession | undefined {
    return this.installer.getSession(sessionId)
  }

  /** 分步安装：执行下一步 */
  stepInstall(sessionId: string, stage: 'copy' | 'deps' | 'assets' | 'register', onProgress?: (depName: string, received: number, total: number) => void): Promise<{ ok: boolean; error?: string }> {
    return this.installer.step(sessionId, stage, onProgress)
  }

  /** 分步安装：下载 tarball（带进度回调） */
  downloadInstallSession(sessionId: string, onProgress?: (received: number, total: number) => void): Promise<void> {
    return this.installer.downloadSession(sessionId, onProgress)
  }

  /** 在线安装（npm 包名）——委托安装器 */
  async installFromNpm(pkgName: string, opts?: { registry?: string }): Promise<PluginInfo> {
    const record = await this.installer.installFromNpm(pkgName, opts)
    return {
      manifest: record.manifest,
      status: { loaded: record.api !== null, enabled: record.enabled, started: record.started },
    }
  }

  /** 主进程资源下载（委托 plugin-assets——不依赖 Worker） */
  async downloadAssets(
    id: string,
    onProgress?: (depName: string, received: number, total: number) => void,
    depName?: string,
  ): Promise<{ name: string; ok: boolean; error?: string }[]> {
    const record = this.registry.get(id)
    if (!record) throw new Error(`插件不存在: ${id}`)
    return this.installer.downloadAssets(record.manifest, onProgress, depName)
  }

  /** 插件自检（Worker 经消息代理） */
  async check(id: string): Promise<PluginCheckResult> {
    const record = this.registry.get(id)
    if (!record?.api) throw new Error(`插件不存在或未加载: ${id}`)
    return (await record.api.check()) as PluginCheckResult
  }

  /** 实时状态 */
  async getStatus(id: string): Promise<PluginStatus> {
    const record = this.registry.get(id)
    if (!record?.api) throw new Error(`插件不存在或未加载: ${id}`)
    return (await record.api.getStatus?.()) ?? { loaded: false, enabled: false, started: false }
  }

  /** 配置 Schema（唯一来源：manifest 静态 configSchema——不依赖 Worker——
   *  动态 getConfigSchema 链路已废弃——插件配置必须静态声明） */
  async getSchema(id: string): Promise<unknown> {
    const record = this.registry.get(id)
    if (!record) return null
    return record.manifest.configSchema ?? null
  }

  /** 读取配置（secret 字段脱敏——依据 manifest 静态 schema） */
  async getConfig(id: string): Promise<Record<string, unknown>> {
    const record = this.registry.get(id)
    const config = record?.ctx?.getConfig<Record<string, unknown>>() ?? {}
    const schema = record?.manifest.configSchema as { properties?: Record<string, { type?: string }> } | null
    if (!schema) return config
    const redacted: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(config)) {
      // secret 类型不返回明文
      redacted[key] = schema.properties?.[key]?.type === 'secret' ? '••••••' : value
    }
    return redacted
  }

  /** 保存配置 */
  async saveConfig(id: string, patch: Record<string, unknown>): Promise<boolean> {
    const record = this.registry.get(id)
    if (!record?.ctx) return false
    record.ctx.setConfig(patch)
    return true
  }

  /** 应用退出清理（全部插件停 + Worker 释放） */
  disposeAll(): void {
    for (const record of this.registry.values()) {
      try {
        void Promise.resolve(record.api?.stop?.()).catch(() => {})
        if (record.worker) this.terminateWorker(record)
        else record.api?.dispose?.()
      } catch {
        // 忽略清理错误
      }
    }
    this.registry.clear()
  }

  // ── 私有实现（加载/接线/静态检查） ──

  /** 校验并加载单个插件（创建 Plugin 活动对象 → Worker 宿主加载） */
  private loadPlugin(dir: string): void {
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as PluginManifest
    if (this.registry.has(manifest.id)) {
      throw new Error(`插件已存在: ${manifest.id}`)
    }
    const plugin = new Plugin(manifest, dir, this.pluginDeps())
    this.registry.set(manifest.id, plugin)
    try {
      plugin.load(dir)
    } catch (e) {
      plugin.error = (e as Error).message
      console.error(`[plugin] ${manifest.id} Worker 启动失败:`, plugin.error)
    }
  }

  /** Plugin 依赖（host/providerRegistry/接线——共享实例） */
  private pluginDeps() {
    return {
      host: this.host,
      registerProvider: (plugin: PluginRecord) => this.registerProviders(plugin),
      unregisterProvider: (plugin: PluginRecord) => this.unregisterProviders(plugin),
      registerIpc: (pluginId: string, channel: string, handler: (payload: unknown) => unknown) => this.registerPluginIpc(pluginId, channel, handler),
      hasChannel: (pluginId: string, channel: string) => this.ipcHandlers.has(`plugin:${pluginId}:${channel}`),
      forwardEvent: (pluginId: string, event: string, data?: unknown) => this.forwardEvent(pluginId, event, data),
    }
  }


  /** 注册插件声明的 IPC 通道（安全接线——handleTrusted） */
  private registerPluginIpc(pluginId: string, channel: string, handler: (payload: unknown) => unknown): void {
    const full = `plugin:${pluginId}:${channel}`
    if (this.ipcHandlers.has(full)) return
    this.ipcHandlers.set(full, handler)
    handleTrusted(full, async (_event, payload: unknown) => {
      try {
        return await handler(payload)
      } catch (e) {
        // 插件未就绪（Worker 未启动——缺资源/自检未过）——返回 null（前端降级显示——不弹全局错误）
        if (/(无 Worker 宿主|Worker 已退出|未启动)/.test((e as Error).message)) {
          return null
        }
        throw e
      }
    })
  }

  /** 调用插件注册的 IPC 能力 */
  async invokePlugin<T>(pluginId: string, channel: string, payload?: unknown): Promise<T> {
    const full = `plugin:${pluginId}:${channel}`
    const handler = this.ipcHandlers.get(full)
    if (!handler) throw new Error(`插件 ${pluginId} 未注册能力 ${channel}`)
    return (await handler(payload)) as T
  }

  /** 插件事件转发 renderer（emitTarget 注入后有效） */
  private forwardEvent(pluginId: string, event: string, data?: unknown): void {
    if (!this.emitTarget || this.emitTarget.isDestroyed()) return
    this.emitTarget.send('plugin:event', { pluginId, event, data })
  }

  /** 资源就绪状态（主进程文件检查——不依赖 Worker——key 用资源名保证唯一——
   *  普通文件资源按具体文件存在判定（同目录多模型不互相误判）；压缩包按目录非空） */
  getAssetStatus(id: string): Record<string, boolean> {
    const record = this.registry.get(id)
    if (!record) return {}
    const dir = join(this.pluginsDir, record.manifest.id)
    const deps = record.manifest.assetDeps ?? record.manifest.modelDeps ?? []
    const status: Record<string, boolean> = {}
    for (const dep of deps) {
      const destDir = join(dir, dep.dest)
      const lower = dep.url.toLowerCase()
      const isArchive = lower.endsWith('.zip') || lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz')
      if (isArchive) {
        // 压缩包：目录非空即就绪（内容结构由解压逻辑保证）
        status[dep.name] = existsSync(destDir) && readdirSync(destDir).length > 0
      } else {
        // 普通文件：具体文件存在才就绪（同目录多资源互不影响）
        const file = basename(dep.url)
        status[dep.name] = existsSync(join(destDir, file))
      }
    }
    return status
  }

  /** 主进程静态声明式检查（不执行插件代码——文件系统检查） */
  staticCheck(record: PluginRecord): { ok: boolean; reason?: string } {
    if (record.manifest.builtin) return { ok: true }
    const dir = join(this.pluginsDir, record.manifest.id)
    const entry = join(dir, record.manifest.entry ?? 'index.js')
    if (!existsSync(entry)) return { ok: false, reason: `入口文件缺失: ${record.manifest.entry}` }
    const deps = record.manifest.assetDeps ?? record.manifest.modelDeps ?? []
    const missing: string[] = []
    for (const dep of deps) {
      if (dep.optional) continue
      const destDir = join(dir, dep.dest)
      if (!existsSync(destDir) || readdirSync(destDir).length === 0) {
        missing.push(`${dep.name}（约 ${dep.sizeMB}MB——可下载）`)
      }
    }
    if (missing.length > 0) return { ok: false, reason: `资源未就绪: ${missing.join('、')}` }
    return { ok: true }
  }

  /** 自检注册（委托 Plugin 活动对象） */
  private autoRegister(record: PluginRecord): void {
    ;(record as Plugin).autoRegister()
  }

  /** 终止 Worker（委托 Plugin） */
  private terminateWorker(record: PluginRecord): void {
    this.host.terminateWorker(record)
  }


}
