/**
 * provider-center.ts — 扩展中心（implements ICenter——客户端侧生命周期）
 *
 * 职责边界（按用户拍板）：
 *   center = 安装/卸载（委托安装器/卸载器）+ 启动全量加载 + 内存注册表 + 可用性校验
 *   installer = 安装（core/installer——品类无关）
 *   uninstaller = 卸载（core/installer——品类无关）
 *   ProviderManager = 上层业务（per-system-interface 配置/调用编排——持有本 center）
 *   Provider = 活动对象（每扩展一个——封装 host/worker 执行）
 *
 * 持久化 = 文件系统（providers/ 目录 + manifest.json + config.json——无数据表）：
 *   已装 = 目录存在；配置 = 目录内 config.json；启动扫盘全量加载进内存注册表。
 *   旧目录 plugins/ 首次启动一次性迁移到 providers/（数据不丢）。
 */

import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'fs'
import { join } from 'path'
import { handleTrusted } from '../../security/ipc-guard'
import { Installer } from '../installer/installer'
import { Uninstaller } from '../installer/uninstaller'
import type { ICenter, CenterItem } from '../center/types'
import { Provider } from './provider'
import { ProviderHost } from './provider-host'
import { persistEnabled } from './provider-store'
import { matchSystemInterfaces } from './system-interfaces'
import { deriveStatus, type ProviderApi, type ProviderCheckResult, type ProviderContext, type ProviderInfo, type ProviderManifest, type ProviderRecord, type ProviderStatus, type ToggleResult } from './types'

/** 扩展中心（implements ICenter——客户端侧生命周期） */
export class ProviderCenter implements ICenter {
  /** 扩展安装目录（品类路径——center 内聚定义——旧 plugins/ 迁移后统一） */
  readonly providersDir: string
  private readonly registry = new Map<string, Provider>()
  /** 扩展注册的 IPC handler（channel → handler），供应用内部转发（接口转发等） */
  private readonly ipcHandlers = new Map<string, (payload: unknown) => unknown>()
  /** renderer 事件转发目标（由 index.ts 注入 mainWindow.webContents） */
  private emitTarget: Electron.WebContents | null = null
  /** Worker 宿主（通用机制——共享实例） */
  private readonly host: ProviderHost
  /** 系统开放接口的 provider 注册表：interfaceId → 已注册（started）扩展 id 列表 */
  private readonly interfaceProviders = new Map<string, string[]>()
  /** 安装器/卸载器（品类无关基建——center 只委托不自己执行） */
  private readonly installer: Installer
  private readonly uninstaller: Uninstaller

  constructor() {
    this.providersDir = join(app.getPath('userData'), 'providers')
    this.migrateLegacyPluginsDir()
    // host 先建（hooks 闭包延迟调用 loader——loader 随后赋值——消息到来时已就绪）
    this.host = new ProviderHost({
      onReady: (record, channels) => (record as Provider).onWorkerReady(channels),
      onEmit: (providerId, event, data) => this.forwardEvent(providerId, event, data),
      onFatal: (record, error) => (record as Provider).onWorkerFatal(error),
    })
    this.installer = new Installer({
      providersDir: this.providersDir,
      toolsDir: join(app.getPath('userData'), 'tools'),
    })
    this.uninstaller = new Uninstaller()
    mkdirSync(this.providersDir, { recursive: true })
  }

  /** 旧目录迁移：plugins/ → providers/（一次——目录存在才 rename——幂等） */
  private migrateLegacyPluginsDir(): void {
    const legacy = join(app.getPath('userData'), 'plugins')
    if (existsSync(legacy) && !existsSync(this.providersDir)) {
      try {
        renameSync(legacy, this.providersDir)
        console.log('[provider] 目录迁移: plugins/ → providers/')
      } catch (e) {
        console.warn('[provider] plugins/ 迁移失败（保留旧目录）:', (e as Error).message)
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ICenter 统一接口（安装/卸载/可用性/清单/加载）
  // ══════════════════════════════════════════════════════════════

  /** 安装（委托安装器分步——注册是自己）——对齐 ICenter 返回 { id } */
  async installFromNpm(pkgName: string, opts?: { registry?: string }): Promise<{ id: string }> {
    const record = await this.installFromNpmFull(pkgName, opts?.registry)
    return { id: record.manifest.id }
  }

  /** 卸载（委托卸载器删目录 + 反注册——Worker 先释放）——对齐 ICenter */
  uninstall(id: string): void {
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
    this.uninstaller.remove(join(this.providersDir, id))
    this.registry.delete(id)
    console.log(`[provider] 已卸载 ${id}`)
  }

  /** 可用性检查（对齐 ICenter——同步静态检查——manifest/入口/资源） */
  check(id: string): { ok: boolean; reason?: string } {
    const record = this.registry.get(id)
    if (!record) return { ok: false, reason: '未安装' }
    return this.staticCheck(record)
  }

  /** 已装清单（对齐 ICenter——{ id, ok, reason? }） */
  list(): CenterItem[] {
    return Array.from(this.registry.values()).map((r) => {
      const staticOk = this.staticCheck(r)
      return { id: r.manifest.id, ok: staticOk.ok, reason: staticOk.ok ? undefined : staticOk.reason }
    })
  }

  /** 启动全量加载（扫盘 → 逐个校验 → 可用才入内存注册表）——对齐 ICenter */
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

  // ══════════════════════════════════════════════════════════════
  // 安装编排（委托安装器 + 自己注册）
  // ══════════════════════════════════════════════════════════════

  /** 扩展是否已安装（注册表查询——安装前校验） */
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

  /** 本地安装（目录/zip——委托安装器分步 + 自己注册）——返回完整记录（controller 用） */
  async installLocal(src: string): Promise<ProviderRecord> {
    const session = this.installer.start(src)
    for (const stage of ['copy', 'deps'] as const) {
      const r = await this.installer.step(session.sessionId, stage)
      if (!r.ok) throw new Error(r.error)
    }
    return this.registerInstalled(session.srcDir)
  }

  /** npm 在线安装（包名——下载 → 分步 → 自己注册）——返回完整记录（controller 用） */
  async installFromNpmFull(pkgName: string, registry?: string): Promise<ProviderRecord> {
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

  /** 安装器实例（controller 分步向导直连——安装域） */
  getInstaller(): Installer {
    return this.installer
  }

  /** 注入事件转发目标（窗口创建后调用） */
  setEmitTarget(wc: Electron.WebContents | null): void {
    this.emitTarget = wc
  }

  /** 事件转发目标（controller 推进度等用） */
  getEmitTarget(): Electron.WebContents | null {
    return this.emitTarget
  }

  // ══════════════════════════════════════════════════════════════
  // 注册表/查询（中心自己维护内存缓存——全量查询给上层 Manager）
  // ══════════════════════════════════════════════════════════════

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

  /** 扩展全量列表（renderer 展示——含静态检查状态） */
  providerList(): ProviderInfo[] {
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

  /** 接口注册表查询（interfaceId → 已注册扩展列表——上层 Manager/服务分发用） */
  getProviders(interfaceId: string): ProviderRecord[] {
    const ids = this.interfaceProviders.get(interfaceId) ?? []
    return ids.map((id) => this.registry.get(id)).filter((r): r is Provider => !!r) as unknown as ProviderRecord[]
  }

  /** 查询扩展（controller 等调用方入口——兼容名） */
  getProvider(id: string): ProviderRecord | null {
    return this.getRecord(id)
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

  /** 扩展深度自检（Worker 经消息代理——生命周期用——非 ICenter 静态 check） */
  async checkHealth(id: string): Promise<ProviderCheckResult> {
    const record = this.registry.get(id)
    if (!record?.api) throw new Error(`扩展不存在或未加载: ${id}`)
    return (await record.api.check()) as ProviderCheckResult
  }

  /** 实时状态（Worker 返回 + 运行时字段合并——started/enabled 以中心记录为准） */
  async getStatus(id: string): Promise<ProviderStatus> {
    const record = this.registry.get(id)
    if (!record?.api) throw new Error(`扩展不存在或未加载: ${id}`)
    const workerStatus = (await record.api.getStatus?.()) ?? {}
    const { loaded: _l, enabled: _e, started: _s, status: _st, ...rest } = workerStatus as ProviderStatus
    return {
      loaded: true,
      enabled: record.enabled,
      started: record.started,
      status: deriveStatus({ loaded: true, enabled: record.enabled, started: record.started }),
      ...rest,
    }
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
