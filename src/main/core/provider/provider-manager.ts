/**
 * provider-manager.ts — 扩展管理器（纯注册表——维护性工作）
 *
 * 职责边界（按用户拍板）：
 *   manager = 注册表增删查 + 配置管理 + IPC 接线
 *   installer = 安装/资源下载/卸载（Installer——独立子系统）
 *   Provider = 活动对象（每扩展一个——封装 host/worker 执行——manager 查询后直接操作）
 *
 * 调用方流程：manager.getProvider(id) → provider.check()/start()/invoke()...
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { handleTrusted } from '../../security/ipc-guard'
import { Installer } from '../installer/installer'
import { Provider } from './provider'
import { ProviderHost } from './provider-host'
import { persistEnabled } from './provider-store'
import { matchSystemInterfaces } from './system-interfaces'
import { deriveStatus, type ProviderApi, type ProviderCheckResult, type ProviderContext, type ProviderInfo, type ProviderManifest, type ProviderRecord, type ProviderStatus, type ToggleResult } from './types'

/** 扩展管理器（纯注册表——维护性工作） */
export class ProviderManager {
  private readonly providersDir: string
  private readonly registry = new Map<string, Provider>()
  /** 扩展注册的 IPC handler（channel → handler），供应用内部转发（接口转发等） */
  private readonly ipcHandlers = new Map<string, (payload: unknown) => unknown>()
  /** renderer 事件转发目标（由 index.ts 注入 mainWindow.webContents） */
  private emitTarget: Electron.WebContents | null = null
  /** Worker 宿主（通用机制——共享实例） */
  private readonly host: ProviderHost
  /** 系统开放接口的 provider 注册表：interfaceId → 已注册（started）扩展 id 列表 */
  private readonly interfaceProviders = new Map<string, string[]>()
  /** 安装器（独立子系统——安装/资源/卸载） */
  private readonly installer: Installer
  constructor() {
    // host 先建（hooks 闭包延迟调用 loader——loader 随后赋值——消息到来时已就绪）
    this.host = new ProviderHost({
      onReady: (record, channels) => (record as Provider).onWorkerReady(channels),
      onEmit: (providerId, event, data) => this.forwardEvent(providerId, event, data),
      onFatal: (record, error) => (record as Provider).onWorkerFatal(error),
    })
    this.providersDir = join(app.getPath('userData'), 'plugins')
    this.installer = new Installer({
      providersDir: this.providersDir,
      toolsDir: join(app.getPath('userData'), 'tools'),
    })
    mkdirSync(this.providersDir, { recursive: true })
  }

  /** 扩展是否已安装（注册表查询——center 安装前校验） */
  isInstalled(id: string): boolean {
    return this.registry.has(id)
  }

  /** 注册已安装目录（分步安装 register 阶段——loadProvider + 返回注册记录） */
  registerInstalled(srcDir: string): ProviderRecord {
    const manifest = JSON.parse(readFileSync(join(srcDir, 'manifest.json'), 'utf-8')) as ProviderManifest
    const destDir = join(this.providersDir, manifest.id)
    this.loadProvider(destDir)
    const record = this.registry.get(manifest.id)
    if (!record) throw new Error('扩展注册失败')
    return record
  }

  /** 本地安装（目录/zip——复用分步安装器 + 自己注册） */
  async installLocal(src: string): Promise<ProviderRecord> {
    const session = this.installer.start(src)
    for (const stage of ['copy', 'deps'] as const) {
      const r = await this.installer.step(session.sessionId, stage)
      if (!r.ok) throw new Error(r.error)
    }
    return this.registerInstalled(session.srcDir)
  }

  /** npm 在线安装（包名——下载 → 分步 → 自己注册） */
  async installFromNpm(pkgName: string, registry?: string): Promise<ProviderRecord> {
    const session = await this.installer.startNpm(pkgName, registry ? { registry } : undefined)
    await this.installer.downloadSession(session.sessionId)
    for (const stage of ['copy', 'deps'] as const) {
      const r = await this.installer.step(session.sessionId, stage)
      if (!r.ok) throw new Error(r.error)
    }
    const record = this.registerInstalled(session.srcDir)
    this.installer.cleanupSession(session.sessionId)
    return record
  }

  /** 注入事件转发目标（窗口创建后调用） */
  setEmitTarget(wc: Electron.WebContents | null): void {
    this.emitTarget = wc
  }

  /** 事件转发目标（controller 推进度等用） */
  getEmitTarget(): Electron.WebContents | null {
    return this.emitTarget
  }

  /** 启动时扫描并加载全部扩展（失败不阻塞，错误记录到扩展状态） */
  loadAll(): void {
    if (!existsSync(this.providersDir)) return
    for (const name of readdirSync(this.providersDir)) {
      const dir = join(this.providersDir, name)
      if (name.startsWith('.') || name.startsWith('_')) continue
      try {
        if (!existsSync(join(dir, 'manifest.json'))) continue
        this.loadProvider(dir)
      } catch (e) {
        console.error(`[provider] 加载失败 ${name}:`, (e as Error).message)
      }
    }
  }

  /** 注册内置扩展（代码注册——main 直跑——不可卸载） */
  registerBuiltinProvider(opts: { manifest: ProviderManifest; provider: { init: (ctx: ProviderContext) => ProviderApi } }): void {
    const { manifest, provider } = opts
    const providerObj = new Provider(manifest, join(this.providersDir, manifest.id), this.providerDeps())
    const configFile = join(this.providersDir, manifest.id, 'config.json')
    const firstRun = !existsSync(configFile)
    try {
      providerObj.loadBuiltin(configFile, provider)
    } catch (e) {
      throw new Error((e as Error).message)
    }
    if (firstRun) providerObj.persistEnabled()
    this.registry.set(manifest.id, providerObj)
    console.log(`[provider] 已加载内置 ${manifest.id}@${manifest.version} (${manifest.capabilities?.join(',') ?? '无能力'})`)
    if (providerObj.enabled) {
      providerObj.autoRegister()
    }
  }


  /** 扩展列表（renderer 展示——含静态检查状态） */
  list(): ProviderInfo[] {
    return Array.from(this.registry.values()).map((r) => {
      const staticOk = this.staticCheck(r)
      return {
        manifest: {
          ...r.manifest,
          // keywords 来自 package.json（npm 发布词——过滤 tinkerdesk-provider 生态标记）
          keywords: this.readProviderKeywords(r.manifest.id),
        },
        status: {
          loaded: r.api !== null,
          enabled: r.enabled,
          started: r.started,
          status: deriveStatus({ loaded: r.api !== null, enabled: r.enabled, started: r.started }),
          configurable: staticOk.ok,
          detail: staticOk.ok ? r.error : staticOk.reason,
        },
      }
    })
  }

  /** 读取扩展 package.json 的 keywords（npm 分类词——过滤生态前缀/空串） */
  private readProviderKeywords(id: string): string[] {
    try {
      const pkgFile = join(this.providersDir, id, 'package.json')
      if (!existsSync(pkgFile)) return []
      const pkg = JSON.parse(readFileSync(pkgFile, 'utf-8')) as { keywords?: unknown }
      const kws = Array.isArray(pkg.keywords) ? pkg.keywords.map(String) : []
      // 过滤：生态标记（tinkerdesk-provider）与包全名（tinkerdesk-provider-xxx）——都是前缀/身份词不是分类
      return kws.filter((k) => k.trim() !== '' && !k.startsWith('tinkerdesk-provider'))
    } catch {
      return []
    }
  }

  /** 查询单个扩展（调用方入口——返回 Provider 活动对象） */
  getRecord(id: string): ProviderRecord | null {
    return this.registry.get(id) ?? null
  }

  /** 扩展列表（含启用态过滤） */
  getProviders(interfaceId: string): ProviderRecord[] {
    const ids = this.interfaceProviders.get(interfaceId) ?? []
    return ids.map((id) => this.registry.get(id)).filter((r): r is Provider => !!r) as unknown as ProviderRecord[]
  }

  /** 扩展注册到其声明接口的 provider 清单 */
  private registerProviders(record: ProviderRecord): void {
    for (const def of matchSystemInterfaces(record.manifest.systemInterfaces)) {
      const list = this.interfaceProviders.get(def.id) ?? []
      if (!list.includes(record.manifest.id)) {
        list.push(record.manifest.id)
        this.interfaceProviders.set(def.id, list)
        console.log(`[provider] ${record.manifest.id} → 注册为接口 ${def.id} 的 provider`)
      }
    }
  }

  /** 扩展从 provider 清单注销 */
  private unregisterProviders(record: ProviderRecord): void {
    for (const def of matchSystemInterfaces(record.manifest.systemInterfaces)) {
      const list = this.interfaceProviders.get(def.id)
      if (list) {
        const next = list.filter((id) => id !== record.manifest.id)
        if (next.length > 0) this.interfaceProviders.set(def.id, next)
        else this.interfaceProviders.delete(def.id)
      }
    }
  }

  /** 查询扩展（controller 等调用方入口——兼容名） */
  getProvider(id: string): ProviderRecord | null {
    return this.getRecord(id)
  }

  /** 启用/停用（启停由 Provider 活动对象执行） */
  async toggle(id: string, enabled: boolean): Promise<ToggleResult> {
    const record = this.registry.get(id)
    if (!record) return { ok: false, enabled }
    record.enabled = enabled
    persistEnabled(record)
    if (!enabled) {
      if (record.worker) {
        void Promise.resolve(record.api?.stop?.()).catch(() => { })
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

  /** 安装器实例（controller 直连——安装域不经过 manager） */
  getInstaller(): Installer {
    return this.installer
  }

  /** 卸载扩展（删除目录——Worker 先释放） */
  uninstallProvider(id: string): void {
    const record = this.registry.get(id)
    if (!record) throw new Error(`扩展不存在: ${id}`)
    if (record.manifest.builtin) {
      throw new Error(`内置扩展不可卸载: ${id}`)
    }
    if (record.started) {
      void Promise.resolve(record.api?.stop?.()).catch(() => { })
      this.unregisterProviders(record)
      record.started = false
      record.enabled = false
    }
    if (record.worker) {
      this.terminateWorker(record)
    }
    this.installer.uninstall(id)
    this.registry.delete(id)
    console.log(`[provider] 已卸载 ${id}`)
  }

  /** 扩展自检（Worker 经消息代理） */
  async check(id: string): Promise<ProviderCheckResult> {
    const record = this.registry.get(id)
    if (!record?.api) throw new Error(`扩展不存在或未加载: ${id}`)
    return (await record.api.check()) as ProviderCheckResult
  }

  /** 实时状态（Worker 返回 + 运行时字段合并——started/enabled 以 manager 记录为准——
   *  扩展 Worker 可能不返回 started——保证配置页/列表状态一致） */
  async getStatus(id: string): Promise<ProviderStatus> {
    const record = this.registry.get(id)
    if (!record?.api) throw new Error(`扩展不存在或未加载: ${id}`)
    const workerStatus = (await record.api.getStatus?.()) ?? {}
    // Worker 返回仅补充 detail 等信息——运行时事实字段以 manager 记录为准
    const { loaded: _l, enabled: _e, started: _s, status: _st, ...rest } = workerStatus as ProviderStatus
    return {
      loaded: true,
      enabled: record.enabled,
      started: record.started,
      status: deriveStatus({ loaded: true, enabled: record.enabled, started: record.started }),
      ...rest,
    }
  }

  /** 配置 Schema（唯一来源：manifest 静态 configSchema——不依赖 Worker——
   *  动态 getConfigSchema 链路已废弃——扩展配置必须静态声明） */
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

  /** 应用退出清理（全部扩展停 + Worker 释放） */
  disposeAll(): void {
    for (const record of this.registry.values()) {
      try {
        void Promise.resolve(record.api?.stop?.()).catch(() => { })
        if (record.worker) this.terminateWorker(record)
        else record.api?.dispose?.()
      } catch {
        // 忽略清理错误
      }
    }
    this.registry.clear()
  }

  // ── 私有实现（加载/接线/静态检查） ──

  /** 校验并加载单个扩展（创建 Provider 活动对象 → Worker 宿主加载） */
  private loadProvider(dir: string): void {
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as ProviderManifest
    if (this.registry.has(manifest.id)) {
      throw new Error(`扩展已存在: ${manifest.id}`)
    }
    const provider = new Provider(manifest, dir, this.providerDeps())
    this.registry.set(manifest.id, provider)
    try {
      provider.load(dir)
    } catch (e) {
      provider.error = (e as Error).message
      console.error(`[provider] ${manifest.id} Worker 启动失败:`, provider.error)
    }
  }

  /** Provider 依赖（host/providerRegistry/接线——共享实例） */
  private providerDeps() {
    return {
      host: this.host,
      registerProvider: (provider: ProviderRecord) => this.registerProviders(provider),
      unregisterProvider: (provider: ProviderRecord) => this.unregisterProviders(provider),
      registerIpc: (providerId: string, channel: string, handler: (payload: unknown) => unknown) => this.registerProviderIpc(providerId, channel, handler),
      hasChannel: (providerId: string, channel: string) => this.ipcHandlers.has(`provider:${providerId}:${channel}`),
      forwardEvent: (providerId: string, event: string, data?: unknown) => this.forwardEvent(providerId, event, data),
    }
  }


  /** 注册扩展声明的 IPC 通道（安全接线——handleTrusted） */
  private registerProviderIpc(providerId: string, channel: string, handler: (payload: unknown) => unknown): void {
    const full = `provider:${providerId}:${channel}`
    if (this.ipcHandlers.has(full)) return
    this.ipcHandlers.set(full, handler)
    handleTrusted(full, async (_event, payload: unknown) => {
      try {
        return await handler(payload)
      } catch (e) {
        // 扩展未就绪（Worker 未启动——缺资源/自检未过）——返回 null（前端降级显示——不弹全局错误）
        if (/(无 Worker 宿主|Worker 已退出|未启动)/.test((e as Error).message)) {
          return null
        }
        throw e
      }
    })
  }

  /** 调用扩展注册的 IPC 能力 */
  async invokeProvider<T>(providerId: string, channel: string, payload?: unknown): Promise<T> {
    const full = `provider:${providerId}:${channel}`
    const handler = this.ipcHandlers.get(full)
    if (!handler) throw new Error(`扩展 ${providerId} 未注册能力 ${channel}`)
    return (await handler(payload)) as T
  }

  /** 扩展事件转发 renderer（emitTarget 注入后有效） */
  private forwardEvent(providerId: string, event: string, data?: unknown): void {
    if (!this.emitTarget || this.emitTarget.isDestroyed()) return
    this.emitTarget.send('provider:event', { providerId, event, data })
  }

  /** 主进程静态声明式检查（不执行扩展代码——文件系统检查） */
  staticCheck(record: ProviderRecord): { ok: boolean; reason?: string } {
    if (record.manifest.builtin) return { ok: true }
    const dir = join(this.providersDir, record.manifest.id)
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

  /** 自检注册（委托 Provider 活动对象） */
  private autoRegister(record: ProviderRecord): void {
    try {
      ; (record as Provider).autoRegister()
    } catch (e) {
      console.error(`[provider] autoRegister 调用异常 ${record.manifest.id}:`, (e as Error).message)
    }
  }

  /** 终止 Worker（委托 Provider） */
  private terminateWorker(record: ProviderRecord): void {
    this.host.terminateWorker(record)
  }


}
