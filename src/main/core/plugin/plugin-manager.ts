/**
 * plugin-manager.ts — TinkerDesk 插件管理器（main 进程）
 *
 * Responsibilities:
 * - scans the %APPDATA%/tinkerdesk/plugins/ directory (each subdirectory = one plugin)
 * - reads manifest.json → validates → require(entry) (CommonJS) → init(ctx)
 * - hosts plugin configs (plugins/<id>/config.json)
 * - forwards plugin events to the renderer (webContents.send('plugin:event', ...))
 * - enable/disable / status queries
 *
 * 安全模型（v1 信任制）：用户手动下载解压 = 主动信任；插件 = main 进程任意代码权限。
 */
import { execFileSync } from 'child_process'
import { app } from 'electron'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import { handleTrusted } from '../../security/ipc-guard'
import { PluginAssets } from './plugin-assets'
import { PluginHost } from './plugin-host'
import { installNpmDeps, locateManifestDir, tarBin, verifyHashes } from './plugin-installer'
import { PluginLoader } from './plugin-loader'
import { ProviderRegistry } from './plugin-registry'
import { persistEnabled, readConfigFile, writeConfigFile } from './plugin-store'
import { matchSystemInterfaces } from './system-interfaces'

import type {
  PluginCheckResult,
  PluginContext,
  PluginInfo,
  PluginManifest,
  PluginRecord,
  PluginStatus,
  TinkerPlugin,
  ToggleResult
} from './types'

export class PluginManager {
  private readonly pluginsDir: string
  private readonly registry = new Map<string, PluginRecord>()
  /** 插件注册的 IPC handler（channel → handler），供应用内部转发（接口转发等） */
  private readonly ipcHandlers = new Map<string, (payload: unknown) => unknown>()
  /** 接口 provider 注册表（独立域——PluginRegistry） */
  private readonly providerRegistry = new ProviderRegistry()
  /** renderer 事件转发目标（由 index.ts 注入 mainWindow.webContents） */
  private emitTarget: Electron.WebContents | null = null
  /** Worker 宿主（spawn/terminate/消息代理——Worker 生命周期归 PluginHost） */
  private readonly host: PluginHost
  /** 加载与注册编排（loadPlugin/autoRegister/ready/fatal——归 PluginLoader）——
   *  host ↔ loader 互相引用（host hooks 延迟调用 loader——闭包安全） */
  private loader!: PluginLoader
  /** 资源下载器（构造注入插件目录） */
  private readonly assets: PluginAssets

  constructor() {
    this.providerRegistry.setByIdResolver((ids) => ids.map((id) => this.registry.get(id)).filter((r): r is PluginRecord => !!r))
    // host 先建（hooks 闭包延迟调用 loader——loader 随后赋值——消息到来时已就绪）
    this.host = new PluginHost({
      onReady: (record, channels) => this.loader.onWorkerReady(record, channels),
      onEmit: (pluginId, event, data) => this.forwardEvent(pluginId, event, data),
      onFatal: (record, error) => this.loader.onWorkerFatal(record, error),
    })
    this.loader = new PluginLoader({
      registry: this.registry,
      host: this.host,
      providerRegistry: this.providerRegistry,
      registerIpc: (pluginId, channel, handler) => this.registerPluginIpc(pluginId, channel, handler),
      hasChannel: (pluginId, channel) => this.ipcHandlers.has(`plugin:${pluginId}:${channel}`),
      forwardEvent: (pluginId, event, data) => this.forwardEvent(pluginId, event, data),
    })
    this.pluginsDir = join(app.getPath('userData'), 'plugins')
    this.assets = new PluginAssets(this.pluginsDir)
    mkdirSync(this.pluginsDir, { recursive: true })
  }

  /** 注入事件转发目标（窗口创建后调用） */
  setEmitTarget(wc: Electron.WebContents | null): void {
    this.emitTarget = wc
  }

  /** 启动时扫描并加载全部插件（失败不阻塞，错误记录到插件状态） */
  loadAll(): void {
    if (!existsSync(this.pluginsDir)) return
    for (const name of readdirSync(this.pluginsDir)) {
      const dir = join(this.pluginsDir, name)
      if (name.startsWith('.') || name.startsWith('_')) continue
      try {
        if (!existsSync(join(dir, 'manifest.json'))) continue
        this.loader.load(dir)
      } catch (e) {
        console.error(`[plugin] 加载失败 ${name}:`, (e as Error).message)
        this.registry.set(name, {
          manifest: { id: name, name, version: '0.0.0', apiVersion: 1, entry: '' },
          api: null,
          ctx: null,
          enabled: false,
          started: false,
          worker: null,
          error: (e as Error).message,
        })
      }
    }
  }

  /**
   * 注册内置插件（代码注册——不落 plugins/ 目录）。
   * 配置存 userData/plugins-builtin/<id>/config.json；首次默认启用。
   * 复用 loadPlugin 的完整初始化（ctx/契约校验/自动注册）。
   */
  registerBuiltinPlugin(opts: { manifest: PluginManifest; plugin: TinkerPlugin }): void {
    const { manifest, plugin } = opts
    if (!manifest.id || !manifest.name) {
      throw new Error('内置插件 manifest 缺少 id/name')
    }
    if (this.registry.has(manifest.id)) {
      throw new Error(`内置插件已存在: ${manifest.id}`)
    }

    const configDir = join(app.getPath('userData'), 'plugins-builtin', manifest.id)
    mkdirSync(configDir, { recursive: true })
    const configFile = join(configDir, 'config.json')
    const firstRun = !existsSync(configFile)
    const { enabled, config } = readConfigFile(configFile)

    const record: PluginRecord = {
      manifest,
      api: null,
      ctx: null,
      // 内置插件首次加载默认启用
      enabled: firstRun ? true : enabled,
      started: false,
      worker: null,
    }
    const ctx: PluginContext = {
      pluginId: manifest.id,
      configDir,
      getManifest: () => manifest,
      emit: (event, data) => this.forwardEvent(manifest.id, event, data),
      registerIpc: (channel, handler) => this.registerPluginIpc(manifest.id, channel, handler),
      getConfig: <T>() => config as T,
      setConfig: (patch) => {
        Object.assign(config, patch)
        writeConfigFile(configFile, { enabled: record.enabled, config })
      },
    }
    record.ctx = ctx
    record.api = plugin.init(ctx)
    if (typeof record.api.check !== 'function') {
      throw new Error(`${manifest.id} 未实现 check() 自检接口（插件契约 v1 强制）`)
    }
    for (const def of matchSystemInterfaces(manifest.systemInterfaces)) {
      // 空契约频道 = 无 IPC 契约（工具直连 provider）——跳过频道校验
      if (def.requiredChannel && !this.ipcHandlers.has(`plugin:${manifest.id}:${def.requiredChannel}`)) {
        throw new Error(`${manifest.id} 声明了接口 ${def.id} 但未注册契约频道 ${def.requiredChannel}（插件契约 v1）`)
      }
    }
    this.registry.set(manifest.id, record)
    if (firstRun) persistEnabled(record)
    console.log(`[plugin] 已加载内置 ${manifest.id}@${manifest.version} (${manifest.capabilities?.join(',') ?? '无能力'})`)

    if (record.enabled) {
      this.loader.autoRegister(record)
    }
  }

  /**
   * 查询某系统开放接口的 provider 清单（已注册的插件）
   * 系统设置页（如语音设置）从清单中选择具体调用哪个 provider
   */
  getProviders(interfaceId: string): PluginRecord[] {
    return this.providerRegistry.getProviders(interfaceId)
  }



  /** 应用内部调用插件 IPC（不经 renderer；如 VoiceProviderService 转发 STT/TTS） */
  async invokePlugin<T>(pluginId: string, channel: string, payload?: unknown): Promise<T> {
    const handler = this.ipcHandlers.get(`plugin:${pluginId}:${channel}`)
    if (!handler) {
      throw new Error(`插件 ${pluginId} 未注册能力 ${channel}`)
    }
    return (await handler(payload)) as T
  }



  /** 安装插件：复制源目录（已解压的插件目录）到 plugins/<id> 并加载；id 冲突 → 抛错 */
  async installPlugin(srcDir: string): Promise<PluginInfo> {
    // 源目录必须含 manifest.json
    const manifestFile = join(srcDir, 'manifest.json')
    if (!existsSync(manifestFile)) {
      throw new Error('所选目录不是有效插件（缺少 manifest.json）')
    }
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf-8')) as PluginManifest
    if (!manifest.id || !manifest.entry || !manifest.name) {
      throw new Error('manifest 缺少 id/entry/name')
    }
    if (manifest.apiVersion !== 1) {
      throw new Error(`不支持的 apiVersion: ${manifest.apiVersion}（当前支持 1）`)
    }
    // id 安全校验（防路径穿越/非法目录名）
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.id)) {
      throw new Error(`插件 id 非法（仅允许小写字母/数字/连字符）: ${manifest.id}`)
    }
    if (this.registry.has(manifest.id)) {
      throw new Error(`插件已存在: ${manifest.id}（请先停用并删除旧版本）`)
    }
    // 复制到插件目录（覆盖式复制，清理旧残留）
    const destDir = join(this.pluginsDir, manifest.id)
    if (existsSync(destDir)) {
      rmSync(destDir, { recursive: true, force: true })
    }
    cpSync(srcDir, destDir, { recursive: true, filter: (src) => !src.includes('node_modules/.cache') })
    // 依赖安装：插件 package.json 声明了 npm 依赖且未自带 node_modules → 自动 npm install
    await installNpmDeps(destDir)
    // 加载（含契约校验）
    this.loader.load(destDir)
    const record = this.registry.get(manifest.id)
    if (!record) {
      throw new Error(`插件加载失败: ${manifest.id}`)
    }
    // 安装后默认启用（自检通过才注册）
    this.loader.autoRegister(record)
    console.log(`[plugin] 已安装 ${manifest.id}@${manifest.version}`)
    return {
      manifest: record.manifest,
      status: {
        loaded: record.api !== null,
        enabled: record.enabled,
        started: record.started,
      },
    }
  }

  /**
   * 从路径安装插件（目录或 .zip）：自动检测 → 解压 → 定位 manifest → installPlugin。
   * 供 UI 安装与 Agent 工具（plugin_install）共用。
   */
  installFromPath(src: string): Promise<PluginInfo> {
    if (!src || !existsSync(src)) {
      throw new Error('插件包路径不存在')
    }
    const stat = statSync(src)
    const tmpDir = join(app.getPath('temp'), `tinkerdesk-plugin-install-${Date.now()}`)
    try {
      let pluginDir: string
      if (stat.isDirectory()) {
        // 目录安装（本地开发调试）：源码直接可见——不校验哈希清单
        pluginDir = src
      } else if (stat.isFile() && src.toLowerCase().endsWith('.zip')) {
        mkdirSync(tmpDir, { recursive: true })
        execFileSync(tarBin(), ['-xf', src, '-C', tmpDir], { stdio: 'ignore' })
        const located = locateManifestDir(tmpDir)
        if (!located) {
          throw new Error('zip 内未找到 manifest.json（插件包结构无效）')
        }
        pluginDir = located
        // 分发 zip：require 前校验 sha256sums.json 哈希清单（防篡改——不匹配直接拒绝）
        verifyHashes(pluginDir)
      } else {
        throw new Error('请选择插件文件夹或 .zip 插件包')
      }
      return this.installPlugin(pluginDir)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  }

  /** 主进程静态声明式检查（不执行插件代码——文件系统检查）：
   *  manifest 已读（loadPlugin 时校验）；entry 存在；依赖 node_modules 存在；
   *  assetDeps 资源就绪度（dest 目录非空）。通过 = 插件可配置（配置页可开——
   *  含资源下载入口）——不依赖 Worker 存活。 */
  staticCheck(record: PluginRecord): { ok: boolean; reason?: string } {
    // 内置插件（代码注册——无 plugins/ 文件系统目录——不可用文件检查——
    // 可用性由 autoRegister 代码自检决定）
    if (record.manifest.builtin) {
      return { ok: true }
    }
    const dir = join(this.pluginsDir, record.manifest.id)
    const entry = join(dir, record.manifest.entry ?? 'index.js')
    if (!existsSync(entry)) {
      return { ok: false, reason: `入口文件缺失: ${record.manifest.entry}` }
    }
    if (record.manifest.assetDeps && record.manifest.assetDeps.length > 0) {
      const missing: string[] = []
      for (const dep of record.manifest.assetDeps) {
        // 可选依赖（外部引擎自带/用户自管——如 IndexTTS 声音克隆模型）跳过
        if (dep.optional) continue
        const destDir = join(dir, dep.dest)
        if (!existsSync(destDir) || readdirSync(destDir).length === 0) {
          missing.push(`${dep.name}（约 ${dep.sizeMB}MB——可下载）`)
        }
      }
      if (missing.length > 0) {
        return { ok: false, reason: `资源未就绪: ${missing.join('、')}` }
      }
    }
    // 旧字段别名（modelDeps——兼容早期插件）
    if (record.manifest.modelDeps && record.manifest.modelDeps.length > 0) {
      const missing: string[] = []
      for (const dep of record.manifest.modelDeps) {
        if (dep.optional) continue
        const destDir = join(dir, dep.dest)
        if (!existsSync(destDir) || readdirSync(destDir).length === 0) {
          missing.push(`${dep.name}（约 ${dep.sizeMB}MB——可下载）`)
        }
      }
      if (missing.length > 0) {
        return { ok: false, reason: `资源未就绪: ${missing.join('、')}` }
      }
    }
    return { ok: true }
  }

  /** 插件列表 */
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

  /**
   * 启停插件（启停状态持久化到 config.json，与插件配置合一个文件）
   * 启用前强制自检（check() 契约）：全部通过才启用并注册到 provider 清单；失败返回引导项
   */
  async toggle(id: string, enabled: boolean): Promise<ToggleResult> {
    const record = this.registry.get(id)
    if (!record || !record.api) {
      throw new Error(`插件不存在或未加载: ${id}`)
    }
    if (enabled && !record.enabled) {
      const check = await record.api.check()
      if (!check || !check.ok) {
        return { ok: false, enabled: false, started: false, checks: check?.checks ?? [] }
      }
      await record.api.start?.()
      record.enabled = true
      record.started = true
      this.providerRegistry.register(record)
      persistEnabled(record)
    } else if (!enabled && record.enabled) {
      await record.api.stop?.()
      record.enabled = false
      record.started = false
      this.providerRegistry.unregister(record)
      persistEnabled(record)
    }
    return { ok: true, enabled: record.enabled, started: record.started }
  }

  /** 卸载插件：停用（注销 provider）→ 终止 Worker → 删除插件目录（含模型/config）→ 移出注册表（内置插件禁止卸载） */
  uninstallPlugin(id: string): void {
    const record = this.registry.get(id)
    if (!record) throw new Error(`插件不存在: ${id}`)
    if (record.manifest.builtin) {
      throw new Error(`内置插件不可卸载: ${id}`)
    }
    if (record.started) {
      void record.api?.stop?.()
      this.providerRegistry.unregister(record)
      record.started = false
      record.enabled = false
    }
    if (record.worker) {
      this.host.terminateWorker(record)
    }
    const dir = join(this.pluginsDir, id)
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
    this.registry.delete(id)
    console.log(`[plugin] 已卸载 ${id}`)
  }

  /** 插件自检（启用前调用；不改变状态） */
  async check(id: string): Promise<PluginCheckResult> {
    const record = this.registry.get(id)
    if (!record?.api) {
      return { ok: false, checks: [{ name: '插件', ok: false, hint: '插件未加载' }] }
    }
    const result = await record.api.check()
    return result ?? { ok: true, checks: [] }
  }

  /** 插件状态（实时查询） */
  async getStatus(id: string): Promise<PluginStatus> {
    const record = this.registry.get(id)
    if (!record || !record.api) {
      return { loaded: false, enabled: false, started: false }
    }
    const custom = await record.api.getStatus?.()
    return custom
      ? { ...custom, enabled: record.enabled, started: record.started }
      : { loaded: true, enabled: record.enabled, started: record.started }
  }

  /** 内部记录访问（Agent 工具等需要直接操作 ctx/配置时用） */
  getRecord(id: string): PluginRecord | null {
    return this.registry.get(id) ?? null
  }

  /** 主进程资源下载（委托 plugin-assets——不依赖 Worker——Worker 挂/资源缺失时仍可用） */
  async downloadAssets(
    id: string,
    onProgress?: (depName: string, received: number, total: number) => void,
  ): Promise<{ name: string; ok: boolean; error?: string }[]> {
    const record = this.registry.get(id)
    if (!record) throw new Error(`插件不存在: ${id}`)
    return this.assets.download(record.manifest, onProgress)
  }


  /** 配置 Schema（动态——Worker 插件经代理异步获取） */
  async getSchema(id: string): Promise<unknown> {
    const record = this.registry.get(id)
    if (!record?.api) return null
    return (await record.api.getConfigSchema?.()) ?? null
  }

  /** 读取配置（secret 字段脱敏回显——Worker 插件 schema 经代理异步获取） */
  async getConfig(id: string): Promise<Record<string, unknown>> {
    const record = this.registry.get(id)
    const config = record?.ctx?.getConfig<Record<string, unknown>>() ?? {}
    const schema = (await record?.api?.getConfigSchema?.()) ?? null
    if (!schema) return config
    // secret 类型不返回明文
    const redacted: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(config)) {
      const field = schema.properties[key]
      redacted[key] = field?.type === 'secret' && value ? '***' : value
    }
    return redacted
  }

  /** 保存配置（secret 留空不覆盖——Worker 插件 schema 经代理异步获取） */
  async saveConfig(id: string, patch: Record<string, unknown>): Promise<void> {
    const record = this.registry.get(id)
    if (!record?.ctx) throw new Error(`插件不存在: ${id}`)
    const schema = (await record.api?.getConfigSchema?.()) ?? null
    const current = record.ctx.getConfig<Record<string, unknown>>()
    const next: Record<string, unknown> = { ...current }
    for (const [key, value] of Object.entries(patch)) {
      const field = schema?.properties[key]
      if (field?.type === 'secret' && (value === '' || value === '***' || value === undefined)) {
        continue // 留空/未改 → 保留原值
      }
      next[key] = value
    }
    record.ctx.setConfig(next)
  }

  /** 卸载全部（应用退出） */
  disposeAll(): void {
    for (const record of this.registry.values()) {
      try {
        if (record.worker) {
          // 外部插件：通知 stop 后终止 Worker（干净退出）
          void record.api?.stop?.()
          this.host.terminateWorker(record)
        } else {
          record.api?.dispose?.()
        }
      } catch (e) {
        console.error(`[plugin] dispose 失败 ${record.manifest.id}:`, (e as Error).message)
      }
    }
    this.registry.clear()
  }

  /** 插件 → renderer 事件（preload 监听 plugin:event 转发） */
  private forwardEvent(pluginId: string, event: string, data?: unknown): void {
    console.log(`[plugin:event] ${pluginId}:${event}`, JSON.stringify(data)?.slice(0, 80))
    this.emitTarget?.send('plugin:event', { pluginId, event, data })
  }

  /** 插件注册 IPC 能力（renderer 调用 plugin:<id>:<channel>；应用内部可经 invokePlugin 调用） */
  private registerPluginIpc(pluginId: string, channel: string, handler: (payload: unknown) => unknown): void {
    const full = `plugin:${pluginId}:${channel}`
    if (this.ipcHandlers.has(full)) {
      console.warn(`[plugin] ${full} 已注册，跳过`)
      return
    }
    this.ipcHandlers.set(full, handler)
    handleTrusted(full, async (_event, payload: unknown) => {
      try {
        return { success: true, data: await handler(payload) }
      } catch (e) {
        console.error(`[plugin] ${full} 调用失败:`, (e as Error).message)
        return { success: false, error: (e as Error).message }
      }
    })
  }
}
