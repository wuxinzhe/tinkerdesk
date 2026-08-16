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
import { app} from 'electron'
import { handleTrusted } from '../../security/ipc-guard'
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, renameSync, rmSync, cpSync, statSync } from 'fs'
import { join, basename } from 'path'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import { execFile } from 'child_process'
import { Worker } from 'worker_threads'
import { get as httpsGet } from 'https'
import { get as httpGet } from 'http'

/** 下载文件（带进度回调——字节数） */
function downloadFile(
  url: string,
  dest: string,
  onProgress?: (received: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? httpsGet : httpGet
    const req = client(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`下载失败 HTTP ${res.statusCode} (${url})`))
        res.resume()
        return
      }
      const total = Number(res.headers['content-length'] ?? 0)
      let received = 0
      const ws = require('fs').createWriteStream(dest)
      res.on('data', (chunk) => {
        received += chunk.length
        onProgress?.(received, total)
      })
      res.pipe(ws)
      ws.on('finish', () => resolve())
      ws.on('error', reject)
    })
    req.setTimeout(60_000, () => {
      req.destroy(new Error(`下载超时: ${url}`))
    })
    req.on('error', reject)
  })
}
import { matchSystemInterfaces, SYSTEM_INTERFACES } from './system-interfaces'
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
  /** 外部插件宿主 Worker（内置插件为 null——main 直跑） */
  worker: Worker | null
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
  /** worker 调用 id → resolver（消息代理的挂起调用） */
  private workerCalls = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private workerCallSeq = 0

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
    const { enabled, config } = this.readConfigFile(configFile)

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
        this.writeConfigFile(configFile, { enabled: record.enabled, config })
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
    if (firstRun) this.persistEnabled(record)
    console.log(`[plugin] 已加载内置 ${manifest.id}@${manifest.version} (${manifest.capabilities?.join(',') ?? '无能力'})`)

    if (record.enabled) {
      this.autoRegister(record)
    }
  }

  /**
   * 校验并加载单个插件（读 manifest → Worker 宿主加载 → init）。
   * 骨架同步返回（registry 建立）——插件在 Worker 线程后台加载——
   * ready 后自动注册 IPC 通道并（若启用）自检注册——main 事件循环零阻塞。
   */
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

    const configFile = join(dir, 'config.json')
    const { enabled, config } = this.readConfigFile(configFile)

    const record: PluginRecord = {
      manifest,
      api: null,
      ctx: null,
      enabled,
      started: false,
      worker: null,
    }
    this.registry.set(manifest.id, record)

    // 在 Worker 线程加载执行插件（外部插件不可信——线程隔离——同步/死循环/CPU 密集
    // 阻塞的只是 Worker 自己的线程——main 事件循环零影响）
    try {
      this.spawnPluginWorker(record, dir, configFile, config)
    } catch (e) {
      record.error = (e as Error).message
      console.error(`[plugin] ${manifest.id} Worker 启动失败:`, record.error)
    }
  }

  /** 创建插件宿主 Worker 并接线（ready → 注册 IPC 通道 + 自检；fatal/error → 标记状态） */
  private spawnPluginWorker(record: PluginRecord, dir: string, configFile: string, config: Record<string, unknown>): void {
    const worker = new Worker(join(__dirname, 'plugin-host-worker.js'), {
      workerData: {
        pluginDir: dir,
        entry: record.manifest.entry,
        manifest: record.manifest,
        configFile,
      },
    })
    record.worker = worker
    // 代理 api/ctx：方法调用转发 Worker（现有代码 record.api/ctx 直接调用——零改动）
    record.api = this.createWorkerApiProxy(record)
    record.ctx = this.createWorkerCtxProxy(record, dir, config)

    worker.on('message', (msg: { type: string; callId?: number; ok?: boolean; data?: unknown; error?: string; event?: string; channels?: string[] }) => {
      if (msg.type === 'ready') {
        // 插件 init 完成——注册其声明的 IPC 通道（renderer 可调）
        const channels = msg.channels ?? []
        for (const channel of channels) {
          this.registerPluginIpc(record.manifest.id, channel, (payload) => this.invokeWorker(record, 'invoke', { channel, payload }))
        }
        // 接口契约校验：声明的系统开放接口必须注册了 requiredChannel
        for (const def of matchSystemInterfaces(record.manifest.systemInterfaces)) {
          if (def.requiredChannel && !this.ipcHandlers.has(`plugin:${record.manifest.id}:${def.requiredChannel}`)) {
            record.error = `声明了接口 ${def.id} 但未注册契约频道 ${def.requiredChannel}（插件契约 v1）`
            console.error(`[plugin] ${record.manifest.id}: ${record.error}`)
            this.terminateWorker(record)
            return
          }
        }
        console.log(`[plugin] 已加载 ${record.manifest.id}@${record.manifest.version} (${record.manifest.capabilities?.join(',') ?? '无能力'})`)
        if (record.enabled) {
          this.autoRegister(record)
        }
        return
      }
      if (msg.type === 'result') {
        const call = this.workerCalls.get(msg.callId ?? -1)
        if (!call) return
        this.workerCalls.delete(msg.callId ?? -1)
        if (msg.ok) call.resolve(msg.data)
        else call.reject(new Error(msg.error ?? '插件调用失败'))
        return
      }
      if (msg.type === 'emit') {
        this.forwardEvent(record.manifest.id, msg.event ?? '', msg.data)
        return
      }
      if (msg.type === 'fatal') {
        record.error = msg.error ?? '插件 Worker 异常'
        console.error(`[plugin] ${record.manifest.id} Worker 错误:`, record.error)
        this.terminateWorker(record)
      }
    })

    worker.on('error', (err) => {
      record.error = err.message
      console.error(`[plugin] ${record.manifest.id} Worker 异常:`, err.message)
    })

    worker.on('exit', (code) => {
      if (record.worker === worker) record.worker = null
      // 非正常退出（非 terminate）——清除挂起调用
      if (code !== 0) {
        for (const [id, call] of this.workerCalls) {
          if ((call as unknown as { worker?: Worker }).worker === worker) {
            this.workerCalls.delete(id)
            call.reject(new Error(`插件 ${record.manifest.id} Worker 已退出 (code=${code})`))
          }
        }
      }
    })
  }

  /** 调用 Worker 执行（invoke handler / call 生命周期方法）——消息代理 + Promise */
  private invokeWorker(record: PluginRecord, type: 'invoke' | 'call', body: Record<string, unknown>): Promise<unknown> {
    const worker = record.worker
    if (!worker) return Promise.reject(new Error(`插件 ${record.manifest.id} Worker 不可用`))
    const callId = ++this.workerCallSeq
    return new Promise((resolve, reject) => {
      this.workerCalls.set(callId, { resolve, reject })
      worker.postMessage({ type, callId, ...body })
    })
  }

  /** Worker 插件的 api 代理（方法调用 → Worker 执行——现有代码 record.api.check() 等零改动） */
  private createWorkerApiProxy(record: PluginRecord): PluginApi {
    const call = (method: string): Promise<unknown> => this.invokeWorker(record, 'call', { method })
    return {
      // check 契约是同步返回——代理异步（调用方 await 场景安全；类型上兼容）
      check: (() => call('check')) as unknown as () => PluginCheckResult,
      start: () => call('start') as Promise<void>,
      stop: () => call('stop') as Promise<void>,
      dispose: (() => call('dispose')) as unknown as () => Promise<void>,
      getStatus: (() => call('getStatus')) as unknown as PluginApi['getStatus'],
      getConfigSchema: (() => call('getConfigSchema')) as unknown as PluginApi['getConfigSchema'],
    }
  }

  /** Worker 插件的 ctx 代理（配置 main 侧读写——与 Worker 同文件——保持一致） */
  private createWorkerCtxProxy(record: PluginRecord, dir: string, config: Record<string, unknown>): PluginContext {
    const configFile = join(dir, 'config.json')
    return {
      pluginId: record.manifest.id,
      configDir: dir,
      getManifest: () => record.manifest,
      emit: (event, data) => this.forwardEvent(record.manifest.id, event, data),
      // IPC 注册在 Worker 内完成（ready 时 main 统一注册代理）——main 侧 no-op
      registerIpc: () => {
        /* no-op */
      },
      getConfig: <T>() => config as T,
      setConfig: (patch) => {
        Object.assign(config, patch)
        this.writeConfigFile(configFile, { enabled: record.enabled, config })
      },
    }
  }

  /** 终止插件 Worker（卸载/停用/崩溃回收） */
  private terminateWorker(record: PluginRecord): void {
    if (record.worker) {
      try {
        record.worker.terminate()
      } catch {
        // 忽略终止错误
      }
      record.worker = null
    }
    // 清理该插件的挂起调用
    for (const [id, call] of this.workerCalls) {
      if ((call as unknown as { pluginId?: string }).pluginId === record.manifest.id) {
        this.workerCalls.delete(id)
        call.reject(new Error(`插件 ${record.manifest.id} 已终止`))
      }
    }
  }

  /** 启动时自动注册（持久化 enabled 且自检通过才真正 start；未就绪保持 enabled 标记等待修复） */
  private autoRegister(record: PluginRecord): void {
    // 内置插件（可信——main 直跑）：本地自检
    if (!record.worker) {
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
      return
    }
    // 外部插件（Worker 宿主）：自检经消息代理异步执行——main 事件循环零阻塞
    void this.invokeWorker(record, 'call', { method: 'check' })
      .then((check) => {
        const c = check as PluginCheckResult | boolean | undefined
        const ok = typeof c === 'boolean' ? c : !!c?.ok
        if (!ok) {
          console.warn(`[plugin] ${record.manifest.id} 配置为启用但自检未通过，等待配置完成后重新启用`)
          return
        }
        return this.invokeWorker(record, 'call', { method: 'start' }).then(() => {
          record.started = true
          this.registerProviders(record)
          console.log(`[plugin] 自动注册 ${record.manifest.id}（自检通过）`)
        })
      })
      .catch((e) => {
        console.error(`[plugin] 自动注册失败 ${record.manifest.id}:`, (e as Error).message)
      })
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
      .filter((r): r is PluginRecord => !!r && r.started)
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
      (r) => r.manifest.capabilities?.includes(cap) && r.started
    )
  }

  /**
   * 自动安装插件 npm 依赖（插件 package.json 的 dependencies——Node.js 生态）。
   * 仅当：插件有 package.json 且声明了 dependencies 且未自带 node_modules。
   * 执行：优先用打包的 npm-cli（Electron node 执行——用户无需装 Node.js）；
   * 回退系统 npm。失败抛错（插件不加载——缺依赖跑不起来）。
   */
  private async installNpmDeps(pluginDir: string): Promise<void> {
    const pkgFile = join(pluginDir, 'package.json')
    if (!existsSync(pkgFile)) return
    let pkg: { dependencies?: Record<string, string> } | null = null
    try {
      pkg = JSON.parse(readFileSync(pkgFile, 'utf-8')) as { dependencies?: Record<string, string> }
    } catch {
      return // package.json 损坏——不阻塞安装（依赖缺失由插件自身报错）
    }
    const deps = pkg?.dependencies
    if (!deps || Object.keys(deps).length === 0) return
    if (existsSync(join(pluginDir, 'node_modules'))) return // 自带依赖——跳过

    console.log(`[plugin] 安装 npm 依赖 ${Object.keys(deps).join(', ')} → ${pluginDir}`)
    const npmCli = this.resolveNpmCli()
    const args = ['install', '--no-audit', '--no-fund', '--no-progress', '--prefix', pluginDir]
    await new Promise<void>((resolve, reject) => {
      // 用 Electron 的 node 执行 npm-cli（打包的 npm）——用户无需安装 Node.js
      execFile(process.execPath, [npmCli, ...args], { timeout: 300_000 }, (err) => {
        if (err) {
          reject(new Error(`npm 依赖安装失败（${(err as Error).message}）——插件未加载`))
          return
        }
        resolve()
      })
    })
    console.log(`[plugin] npm 依赖安装完成 ${pluginDir}`)
  }

  /** 解析 npm-cli 路径：打包版（resources/npm）→ 项目 node_modules → 系统 npm */
  private resolveNpmCli(): string {
    // 生产：electron-builder extraResources 打包的 npm（asar 外——自包含）
    const bundled = join(process.resourcesPath ?? '', 'npm', 'bin', 'npm-cli.js')
    if (existsSync(bundled)) return bundled
    // 开发：项目依赖里的 npm（npm install npm 已装）
    const local = join(app.getAppPath(), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (existsSync(local)) return local
    // 回退：系统 npm（npm 命令——Windows 下 npm.cmd）
    return 'npm'
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
    await this.installNpmDeps(destDir)
    // 加载（含契约校验）
    this.loadPlugin(destDir)
    const record = this.registry.get(manifest.id)
    if (!record) {
      throw new Error(`插件加载失败: ${manifest.id}`)
    }
    // 安装后默认启用（自检通过才注册）
    this.autoRegister(record)
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
        execFileSync(this.tarBin(), ['-xf', src, '-C', tmpDir], { stdio: 'ignore' })
        const located = this.locateManifestDir(tmpDir)
        if (!located) {
          throw new Error('zip 内未找到 manifest.json（插件包结构无效）')
        }
        pluginDir = located
        // 分发 zip：require 前校验 sha256sums.json 哈希清单（防篡改——不匹配直接拒绝）
        this.verifyHashes(pluginDir)
      } else {
        throw new Error('请选择插件文件夹或 .zip 插件包')
      }
      return this.installPlugin(pluginDir)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  }

  /** 在解压目录中定位含 manifest.json 的插件目录（根目录或一层子目录） */
  private locateManifestDir(root: string): string | null {
    if (existsSync(join(root, 'manifest.json'))) return root
    try {
      for (const name of readdirSync(root)) {
        const sub = join(root, name)
        if (statSync(sub).isDirectory() && existsSync(join(sub, 'manifest.json'))) {
          return sub
        }
      }
    } catch {
      // 忽略不可读子目录
    }
    return null
  }

  /**
   * 校验插件目录哈希清单（sha256sums.json——分发 zip 必须附带）
   *
   * 清单格式：{ "相对路径": "sha256hex", ... }——覆盖包内每个文件（不含清单自身）。
   * 校验策略：缺失清单 / 清单列出的文件缺失 / 哈希不匹配 → 一律拒绝（防传输损坏与部分篡改）。
   * 注意：哈希校验防的是「包内文件与清单不一致」——完整防伪需要发布者签名（后续增强）。
   */
  private verifyHashes(pluginDir: string): void {
    const sumsFile = join(pluginDir, 'sha256sums.json')
    if (!existsSync(sumsFile)) {
      throw new Error('zip 插件包缺少 sha256sums.json 哈希清单（分发包必须附带——缺失拒绝安装）')
    }
    let sums: Record<string, string>
    try {
      sums = JSON.parse(readFileSync(sumsFile, 'utf-8')) as Record<string, string>
    } catch {
      throw new Error('sha256sums.json 解析失败（哈希清单损坏）')
    }
    if (Object.keys(sums).length === 0) {
      throw new Error('sha256sums.json 为空（哈希清单无效）')
    }
    for (const [rel, expected] of Object.entries(sums)) {
      // 路径安全：清单内路径必须是相对路径且不得逃逸插件目录
      const normalized = rel.replace(/\\/g, '/')
      if (normalized.startsWith('/') || normalized.includes('../') || normalized.includes('..\\')) {
        throw new Error(`sha256sums.json 含非法路径: ${rel}`)
      }
      const file = join(pluginDir, rel)
      if (!existsSync(file)) {
        throw new Error(`sha256sums.json 列出的文件缺失: ${rel}`)
      }
      const actual = createHash('sha256').update(readFileSync(file)).digest('hex')
      if (actual.toLowerCase() !== String(expected).toLowerCase()) {
        throw new Error(`插件文件哈希不匹配（可能被篡改或传输损坏）: ${rel}`)
      }
    }
  }

  /** tar 命令：Windows 用 System32 自带 bsdtar（Electron PATH 的 tar 不可用）；Linux/macOS 用系统 tar */
  private tarBin(): string {
    if (process.platform === 'win32') {
      const sysRoot = process.env.SystemRoot ?? 'C:\\Windows'
      return join(sysRoot, 'System32', 'tar.exe')
    }
    return 'tar'
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
      this.registerProviders(record)
      this.persistEnabled(record)
    } else if (!enabled && record.enabled) {
      await record.api.stop?.()
      record.enabled = false
      record.started = false
      this.unregisterProviders(record)
      this.persistEnabled(record)
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
      this.unregisterProviders(record)
      record.started = false
      record.enabled = false
    }
    if (record.worker) {
      this.terminateWorker(record)
    }
    const dir = join(this.pluginsDir, id)
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
    this.registry.delete(id)
    console.log(`[plugin] 已卸载 ${id}`)
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

  /** 内部记录访问（Agent 工具等需要直接操作 ctx/配置时用） */
  getRecord(id: string): PluginRecord | null {
    return this.registry.get(id) ?? null
  }

  /**
   * 主进程资源下载（不依赖插件 Worker——Worker 挂/资源缺失时仍可用）。
   * 读 manifest.assetDeps → 下载 URL → 解压（tar.bz2/tar.gz/zip）→ 就位到 dest。
   * 返回每项结果；进度经 callback 回调（下载字节/总字节）。
   */
  async downloadAssets(
    id: string,
    onProgress?: (depName: string, received: number, total: number) => void,
  ): Promise<{ name: string; ok: boolean; error?: string }[]> {
    const record = this.registry.get(id)
    if (!record) throw new Error(`插件不存在: ${id}`)
    const deps = record.manifest.assetDeps ?? []
    if (deps.length === 0) throw new Error(`插件 ${id} 未声明资源依赖（assetDeps）`)
    const dir = join(this.pluginsDir, id)
    const results: { name: string; ok: boolean; error?: string }[] = []
    for (const dep of deps) {
      // 可选依赖不下载（外部引擎自带/用户自管）
      if (dep.optional) continue
      try {
        const tmp = join(dir, `.download-${Date.now()}-${basename(dep.url)}`)
        await downloadFile(dep.url, tmp, (recv, total) => onProgress?.(dep.name, recv, total))
        const destDir = join(dir, dep.dest)
        if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
        // 按扩展名解压（tar.bz2 / tar.gz / zip / 裸文件）
        const lower = dep.url.toLowerCase()
        if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2')) {
          execFileSync('tar', ['-xjf', tmp, '-C', destDir], { stdio: 'pipe' })
        } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
          execFileSync('tar', ['-xzf', tmp, '-C', destDir], { stdio: 'pipe' })
        } else if (lower.endsWith('.zip')) {
          execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -Path '${tmp}' -DestinationPath '${destDir}' -Force`], { stdio: 'pipe' })
        } else {
          renameSync(tmp, join(destDir, basename(dep.url)))
        }
        // 清理临时文件（解压分支）
        if (existsSync(tmp)) rmSync(tmp, { force: true })
        results.push({ name: dep.name, ok: true })
      } catch (e) {
        results.push({ name: dep.name, ok: false, error: (e as Error).message })
      }
    }
    return results
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
          this.terminateWorker(record)
        } else {
          record.api?.dispose?.()
        }
      } catch (e) {
        console.error(`[plugin] dispose 失败 ${record.manifest.id}:`, (e as Error).message)
      }
    }
    this.registry.clear()
  }
}
