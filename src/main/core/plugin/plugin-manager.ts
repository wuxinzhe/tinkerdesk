/**
 * plugin-manager.ts — TinkerDesk 插件管理器（main 进程）
 *
 * 职责：
 * - 扫描 %APPDATA%/tinkerdesk/plugins/ 目录（每个子目录 = 一个插件）
 * - 读取 manifest.json → 校验 → require(entry)（CommonJS）→ init(ctx)
 * - 托管插件配置（plugins/<id>/config.json）
 * - 插件事件转发 renderer（webContents.send('plugin:event', ...)）
 * - 启停 / 状态查询
 *
 * 安全模型（v1 信任制）：用户手动下载解压 = 主动信任；插件 = main 进程任意代码权限。
 */
import { app, ipcMain } from 'electron'
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { join } from 'path'
import { matchSystemInterfaces, findSystemInterface, SYSTEM_INTERFACES } from './system-interfaces'
import type {
  PluginApi,
  PluginCheckResult,
  PluginContext,
  PluginInfo,
  PluginManifest,
  PluginStatus,
  TinkerPlugin,
  ToggleResult,
} from './types'

interface PluginRecord {
  manifest: PluginManifest
  api: PluginApi | null
  ctx: PluginContext | null
  /** 持久化的启用意图（config.json.enabled） */
  enabled: boolean
  /** 运行时实际注册状态（自检通过 + start 成功 → 加入 provider 清单） */
  started: boolean
  error?: string
}

/** config.json 结构：启停状态 + 插件配置合一个文件 */
interface PluginConfigFile {
  enabled: boolean
  config: Record<string, unknown>
}

export class PluginManager {
  private readonly pluginsDir: string
  private readonly registry = new Map<string, PluginRecord>()
  /** 插件注册的 IPC handler（channel → handler），供应用内部转发（接口转发等） */
  private readonly ipcHandlers = new Map<string, (payload: unknown) => unknown>()
  /** 系统开放接口的 provider 注册表：interfaceId → 已注册（started）插件 id 列表 */
  private readonly interfaceProviders = new Map<string, string[]>()
  /** renderer 事件转发目标（由 index.ts 注入 mainWindow.webContents） */
  private emitTarget: Electron.WebContents | null = null

  constructor() {
    this.pluginsDir = join(app.getPath('userData'), 'plugins')
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
        this.loadPlugin(dir)
      } catch (e) {
        console.error(`[plugin] 加载失败 ${name}:`, (e as Error).message)
        this.registry.set(name, {
          manifest: { id: name, name, version: '0.0.0', apiVersion: 1, entry: '' },
          api: null,
          ctx: null,
          enabled: false,
          started: false,
          error: (e as Error).message,
        })
      }
    }
  }

  /** 加载单个插件（读 manifest → require → init） */
  private loadPlugin(dir: string): void {
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as PluginManifest

    // 校验
    if (!manifest.id || !manifest.entry || !manifest.name) {
      throw new Error('manifest 缺少 id/entry/name')
    }
    if (manifest.apiVersion !== 1) {
      throw new Error(`不支持的 apiVersion: ${manifest.apiVersion}（当前支持 1）`)
    }
    if (manifest.id !== dir.split(/[\\/]/).pop()) {
      throw new Error(`manifest.id(${manifest.id}) 与目录名不一致`)
    }
    if (this.registry.has(manifest.id)) {
      throw new Error(`插件已存在: ${manifest.id}`)
    }

    // 加载入口（插件自带依赖，require 解析相对其目录）
    const entryPath = join(dir, manifest.entry)
    const entryModule = require(entryPath) as { default?: TinkerPlugin } | TinkerPlugin
    const plugin: TinkerPlugin = (entryModule as { default?: TinkerPlugin }).default ?? (entryModule as TinkerPlugin)

    const configFile = join(dir, 'config.json')
    const { enabled, config } = this.readConfigFile(configFile)

    // 上下文：插件通过 ctx 访问配置 / 注册 IPC / 发事件
    const record: PluginRecord = {
      manifest,
      api: null,
      ctx: null,
      enabled,
      started: false,
    }
    const ctx: PluginContext = {
      pluginId: manifest.id,
      configDir: dir,
      getManifest: () => manifest,
      emit: (event, data) => this.forwardEvent(manifest.id, event, data),
      registerIpc: (channel, handler) => this.registerPluginIpc(manifest.id, channel, handler),
      getConfig: <T>() => config as T,
      setConfig: (patch) => {
        Object.assign(config, patch)
        this.writeConfigFile(configFile, { enabled: record.enabled, config })
      },
    }
    record.ctx = ctx
    record.api = plugin.init(ctx)
    // 强制契约：每个插件必须实现 check()（启用前自检）
    if (typeof record.api.check !== 'function') {
      throw new Error(`${manifest.id} 未实现 check() 自检接口（插件契约 v1 强制）`)
    }
    // 接口契约校验：声明的系统开放接口必须注册了 requiredChannel
    for (const def of matchSystemInterfaces(manifest.systemInterfaces)) {
      if (!this.ipcHandlers.has(`plugin:${manifest.id}:${def.requiredChannel}`)) {
        throw new Error(
          `${manifest.id} 声明了接口 ${def.id} 但未注册契约频道 ${def.requiredChannel}（插件契约 v1）`
        )
      }
    }
    this.registry.set(manifest.id, record)
    console.log(`[plugin] 已加载 ${manifest.id}@${manifest.version} (${manifest.capabilities?.join(',') ?? '无能力'})`)

    // 启动时自动注册：配置文件里是启用状态 → 自检就绪 → start + 加入 provider 清单
    if (record.enabled) {
      this.autoRegister(record)
    }
  }

  /** 启动时自动注册（持久化 enabled 且自检通过才真正 start；未就绪保持 enabled 标记等待修复） */
  private autoRegister(record: PluginRecord): void {
    if (!record.api) return
    try {
      const check = record.api.check()
      if (check && check.ok) {
        void record.api.start?.()
        record.started = true
        this.registerProviders(record)
        console.log(`[plugin] 自动注册 ${record.manifest.id}（自检通过）`)
      } else {
        console.warn(`[plugin] ${record.manifest.id} 配置为启用但自检未通过，等待配置完成后重新启用`)
      }
    } catch (e) {
      console.error(`[plugin] 自动注册失败 ${record.manifest.id}:`, (e as Error).message)
    }
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
      const list = this.interfaceProviders.get(def.id) ?? []
      const next = list.filter((id) => id !== record.manifest.id)
      this.interfaceProviders.set(def.id, next)
    }
  }

  /**
   * 查询某系统开放接口的 provider 清单（已注册的插件）
   * 系统设置页（如语音设置）从清单中选择具体调用哪个 provider
   */
  getProviders(interfaceId: string): PluginRecord[] {
    const ids = this.interfaceProviders.get(interfaceId) ?? []
    return ids
      .map((id) => this.registry.get(id))
      .filter((r): r is PluginRecord => !!r && r.api !== null && r.started)
  }

  /** 系统开放接口定义（设置页展示用） */
  getInterfaceDefinitions(): typeof import('./system-interfaces').SYSTEM_INTERFACES {
    return SYSTEM_INTERFACES
  }

  /** 读取 config.json（兼容旧格式：纯配置对象 → 视为 { enabled: false, config }） */
  private readConfigFile(configFile: string): PluginConfigFile {
    if (!existsSync(configFile)) return { enabled: false, config: {} }
    try {
      const raw = JSON.parse(readFileSync(configFile, 'utf-8'))
      if (raw && typeof raw === 'object' && 'config' in raw && 'enabled' in raw) {
        return { enabled: !!raw.enabled, config: (raw.config as Record<string, unknown>) ?? {} }
      }
      // 旧格式：纯配置对象
      return { enabled: false, config: raw }
    } catch {
      return { enabled: false, config: {} }
    }
  }

  /** 写 config.json（原子：先写临时文件再改名） */
  private writeConfigFile(configFile: string, data: PluginConfigFile): void {
    const tmp = `${configFile}.tmp`
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
    renameSync(tmp, configFile)
  }

  /** 插件 → renderer 事件（preload 监听 plugin:event 转发） */
  private forwardEvent(pluginId: string, event: string, data?: unknown): void {
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
    ipcMain.handle(full, async (_event, payload: unknown) => {
      try {
        return { success: true, data: await handler(payload) }
      } catch (e) {
        return { success: false, error: (e as Error).message }
      }
    })
  }

  /** 应用内部调用插件 IPC（不经 renderer；如 VoiceProviderService 转发 STT/TTS） */
  async invokePlugin<T>(pluginId: string, channel: string, payload?: unknown): Promise<T> {
    const handler = this.ipcHandlers.get(`plugin:${pluginId}:${channel}`)
    if (!handler) {
      throw new Error(`插件 ${pluginId} 未注册能力 ${channel}`)
    }
    return (await handler(payload)) as T
  }

  /** 按能力声明查询插件（如 capabilities 含 stt/tts 的 provider）；只返回已注册（started）的 */
  findByCapability(cap: string): PluginRecord[] {
    return Array.from(this.registry.values()).filter(
      (r) => r.manifest.capabilities?.includes(cap) && r.api !== null && r.started
    )
  }

  /** 插件列表 */
  list(): PluginInfo[] {
    return Array.from(this.registry.values()).map((r) => ({
      manifest: r.manifest,
      status: {
        loaded: r.api !== null,
        enabled: r.enabled,
        started: r.started,
        detail: r.error,
      },
    }))
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
        return { ok: false, enabled: false, checks: check?.checks ?? [] }
      }
      await record.api.start?.()
      record.enabled = true
      record.started = true
      this.registerProviders(record)
      this.persistEnabled(record)
    } else if (!enabled && record.enabled) {
      await record.api.stop?.()
      record.enabled = false
      record.started = false
      this.unregisterProviders(record)
      this.persistEnabled(record)
    }
    return { ok: true, enabled: record.enabled }
  }

  /** 持久化启停状态到 config.json（与配置同文件） */
  private persistEnabled(record: PluginRecord): void {
    if (!record.ctx) return
    // ctx.setConfig 会写入 { enabled: record.enabled, config }——直接复用写文件
    const configFile = join(record.ctx.configDir, 'config.json')
    this.writeConfigFile(configFile, {
      enabled: record.enabled,
      config: record.ctx.getConfig<Record<string, unknown>>(),
    })
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

  /** 配置 Schema（动态） */
  getSchema(id: string): unknown {
    const record = this.registry.get(id)
    return record?.api?.getConfigSchema?.() ?? null
  }

  /** 读取配置（secret 字段脱敏回显） */
  getConfig(id: string): Record<string, unknown> {
    const record = this.registry.get(id)
    const config = record?.ctx?.getConfig<Record<string, unknown>>() ?? {}
    const schema = record?.api?.getConfigSchema?.()
    if (!schema) return config
    // secret 类型不返回明文
    const redacted: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(config)) {
      const field = schema.properties[key]
      redacted[key] = field?.type === 'secret' && value ? '***' : value
    }
    return redacted
  }

  /** 保存配置（secret 留空不覆盖） */
  saveConfig(id: string, patch: Record<string, unknown>): void {
    const record = this.registry.get(id)
    if (!record?.ctx) throw new Error(`插件不存在: ${id}`)
    const schema = record.api?.getConfigSchema?.()
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
        record.api?.dispose?.()
      } catch (e) {
        console.error(`[plugin] dispose 失败 ${record.manifest.id}:`, (e as Error).message)
      }
    }
    this.registry.clear()
  }
}
