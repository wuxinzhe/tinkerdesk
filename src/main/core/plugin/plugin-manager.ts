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
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type {
  PluginApi,
  PluginContext,
  PluginInfo,
  PluginManifest,
  PluginStatus,
  TinkerPlugin,
} from './types'

interface PluginRecord {
  manifest: PluginManifest
  api: PluginApi | null
  ctx: PluginContext | null
  enabled: boolean
  error?: string
}

export class PluginManager {
  private readonly pluginsDir: string
  private readonly registry = new Map<string, PluginRecord>()
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
    let config: Record<string, unknown> = {}
    if (existsSync(configFile)) {
      try {
        config = JSON.parse(readFileSync(configFile, 'utf-8'))
      } catch {
        config = {}
      }
    }

    // 上下文：插件通过 ctx 访问配置 / 注册 IPC / 发事件
    const record: PluginRecord = {
      manifest,
      api: null,
      ctx: null,
      enabled: false,
    }
    const ctx: PluginContext = {
      pluginId: manifest.id,
      configDir: dir,
      getManifest: () => manifest,
      emit: (event, data) => this.forwardEvent(manifest.id, event, data),
      registerIpc: (channel, handler) => this.registerPluginIpc(manifest.id, channel, handler),
      getConfig: <T>() => config as T,
      setConfig: (patch) => {
        config = { ...config, ...patch }
        writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8')
      },
    }
    record.ctx = ctx
    record.api = plugin.init(ctx)
    this.registry.set(manifest.id, record)
    console.log(`[plugin] 已加载 ${manifest.id}@${manifest.version} (${manifest.capabilities?.join(',') ?? '无能力'})`)
  }

  /** 插件 → renderer 事件（preload 监听 plugin:event 转发） */
  private forwardEvent(pluginId: string, event: string, data?: unknown): void {
    this.emitTarget?.send('plugin:event', { pluginId, event, data })
  }

  /** 插件注册 IPC 能力（renderer 调用 plugin:<id>:<channel>） */
  private registerPluginIpc(pluginId: string, channel: string, handler: (payload: unknown) => unknown): void {
    const full = `plugin:${pluginId}:${channel}`
    if (ipcMain.listenerCount(full) > 0) {
      console.warn(`[plugin] ${full} 已注册，跳过`)
      return
    }
    ipcMain.handle(full, async (_event, payload: unknown) => {
      try {
        return { success: true, data: await handler(payload) }
      } catch (e) {
        return { success: false, error: (e as Error).message }
      }
    })
  }

  /** 插件列表 */
  list(): PluginInfo[] {
    return Array.from(this.registry.values()).map((r) => ({
      manifest: r.manifest,
      status: {
        loaded: r.api !== null,
        enabled: r.enabled,
        detail: r.error,
      },
    }))
  }

  /** 启停插件 */
  async toggle(id: string, enabled: boolean): Promise<boolean> {
    const record = this.registry.get(id)
    if (!record || !record.api) {
      throw new Error(`插件不存在或未加载: ${id}`)
    }
    if (enabled && !record.enabled) {
      await record.api.start?.()
      record.enabled = true
    } else if (!enabled && record.enabled) {
      await record.api.stop?.()
      record.enabled = false
    }
    return record.enabled
  }

  /** 插件状态（实时查询） */
  async getStatus(id: string): Promise<PluginStatus> {
    const record = this.registry.get(id)
    if (!record || !record.api) {
      return { loaded: false, enabled: false }
    }
    const custom = await record.api.getStatus?.()
    return custom ?? { loaded: true, enabled: record.enabled }
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
