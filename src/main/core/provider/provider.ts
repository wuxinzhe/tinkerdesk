/**
 * provider.ts — 扩展活动对象（每扩展一个实例——封装扩展的全部业务行为）
 *
 * 高内聚：扩展的 load/check/start/stop/invoke/配置/ready/fatal 处理都在本对象。
 * 低耦合：组合 ProviderHost（通用 worker 宿主——共享实例）与 ProviderStore（配置持久化）——
 * 不复制通用机制——只做扩展自身的行为编排。
 */
import { join } from 'path'
import { persistEnabled, readConfigFile, writeConfigFile } from './provider-store'
import { matchSystemInterfaces } from './system-interfaces'
import { deriveStatus, type ProviderApi, type ProviderCheckResult, type ProviderContext, type ProviderDeps, type ProviderManifest, type ProviderStatus } from './types'

/** Provider 活动对象（manager 注册表存本对象——调用方直接操作） */
export class Provider {
  manifest: ProviderManifest
  api: ProviderApi | null = null
  ctx: ProviderContext | null = null
  /** 持久化的启用意图（config.json.enabled） */
  enabled: boolean
  /** 运行时实际注册状态（自检通过 + start 成功 → 加入 provider 清单） */
  started = false
  error?: string
  /** 外部扩展宿主 Worker（内置扩展为 null——main 直跑） */
  worker: import('worker_threads').Worker | null = null
  private config: Record<string, unknown>

  constructor(
    manifest: ProviderManifest,
    private readonly dir: string,
    private readonly deps: ProviderDeps,
  ) {
    this.manifest = manifest
    this.enabled = readConfigFile(join(dir, 'config.json')).enabled
    this.config = readConfigFile(join(dir, 'config.json')).config
  }

  // ── 加载（内置 main 直跑 / 外部 Worker 宿主——编排入本对象） ──

  /** 校验并加载外部扩展（读 manifest → Worker 宿主——骨架同步返回——后台加载） */
  load(dir: string): void {
    if (!this.manifest.id || !this.manifest.entry || !this.manifest.name) {
      throw new Error('manifest 缺少 id/entry/name')
    }
    if (this.manifest.apiVersion !== 1) {
      throw new Error(`不支持的 apiVersion: ${this.manifest.apiVersion}（当前支持 1）`)
    }
    const configFile = join(dir, 'config.json')
    const { enabled, config } = readConfigFile(configFile)
    this.enabled = enabled
    this.config = config
    // Worker 线程加载执行（外部扩展不可信——线程隔离——阻塞只影响 Worker 自己）
    this.loadWorker(configFile, config)
  }

  /** 内置扩展：main 直跑 init——本地上下文 */
  loadBuiltin(configFile: string, provider: { init: (ctx: ProviderContext) => ProviderApi }): void {
    const manifest = this.manifest
    this.ctx = {
      providerId: manifest.id,
      configDir: this.dir,
      getManifest: () => manifest,
      emit: (event, data) => this.deps.forwardEvent(manifest.id, event, data),
      registerIpc: (channel, handler) => this.deps.registerIpc(manifest.id, channel, handler),
      getConfig: <T>() => this.config as T,
      setConfig: (patch) => {
        Object.assign(this.config, patch)
        writeConfigFile(configFile, { enabled: this.enabled, config: this.config })
      },
    }
    this.api = provider.init(this.ctx)
    if (typeof this.api.check !== 'function') {
      throw new Error(`${manifest.id} 未实现 check() 自检接口（扩展契约 v1 强制）`)
    }
    // 内置扩展首次加载默认启用（由 manager 处理 firstRun）
  }

  /** 外部扩展：Worker 宿主加载（后台——ready 经 onWorkerReady 回调） */
  loadWorker(configFile: string, config: Record<string, unknown>): void {
    this.config = config
    this.deps.host.spawnWorker(this, this.dir, configFile, config)
  }

  // ── Worker ready/fatal（ProviderHost 回调——编排入本对象） ──

  /** Worker ready：注册 IPC 通道 + 接口契约校验 + 自动注册 */
  onWorkerReady(channels: string[]): void {
    for (const channel of channels) {
      this.deps.registerIpc(this.manifest.id, channel, (payload) => this.invoke(channel, payload))
    }
    // 接口契约校验：声明的系统开放接口必须注册了 requiredChannel
    for (const def of matchSystemInterfaces(this.manifest.systemInterfaces)) {
      if (def.requiredChannel && !this.deps.hasChannel(this.manifest.id, def.requiredChannel)) {
        this.error = `声明了接口 ${def.id} 但未注册契约频道 ${def.requiredChannel}（扩展契约 v1）`
        console.error(`[provider] ${this.manifest.id}: ${this.error}`)
        this.disposeWorker()
        return
      }
    }
    console.log(`[provider] 已加载 ${this.manifest.id}@${this.manifest.version} (${this.manifest.capabilities?.join(',') ?? '无能力'})`)
    if (this.enabled) {
      this.autoRegister()
    }
  }

  /** Worker fatal：记录错误 + 终止 */
  onWorkerFatal(error: string): void {
    this.error = error
    console.error(`[provider] ${this.manifest.id} Worker 错误:`, error)
    this.disposeWorker()
  }

  // ── 生命周期执行（调用方直接操作） ──

  /** 自检注册（持久化 enabled 且自检通过才真正 start） */
  autoRegister(): void {
    // 内置扩展（main 直跑）：本地自检
    if (!this.worker) {
      if (!this.api) return
      try {
        const check = this.api.check()
        if (check && check.ok) {
          void this.api.start?.()
          this.started = true
          this.deps.registerProvider(this)
          console.log(`[provider] 自动注册 ${this.manifest.id}（自检通过）`)
        } else {
          console.warn(`[provider] ${this.manifest.id} 配置为启用但自检未通过，等待配置完成后重新启用`)
        }
      } catch (e) {
        console.error(`[provider] 自动注册失败 ${this.manifest.id}:`, (e as Error).message)
      }
      return
    }
    // 外部扩展（Worker 宿主）：自检经消息代理异步执行（全路径 catch——Worker 不可用不算 fatal）
    void (async () => {
      try {
        const check = await this.deps.host.invokeWorker(this, 'call', { method: 'check' })
        const c = check as ProviderCheckResult | boolean | undefined
        const ok = typeof c === 'boolean' ? c : !!c?.ok
        if (!ok) {
          console.warn(`[provider] ${this.manifest.id} 配置为启用但自检未通过，等待配置完成后重新启用`)
          return
        }
        await this.deps.host.invokeWorker(this, 'call', { method: 'start' })
        this.started = true
        this.deps.registerProvider(this)
        console.log(`[provider] 自动注册 ${this.manifest.id}（自检通过）`)
      } catch (e) {
        console.error(`[provider] 自动注册失败 ${this.manifest.id}:`, (e as Error).message)
      }
    })()
  }

  /** 调用扩展注册的 IPC 能力 */
  async invoke<T>(channel: string, payload?: unknown): Promise<T> {
    if (!this.worker) {
      // 内置扩展：本地 handler
      const handler = this.ctx?.registerIpc && channel ? undefined : undefined
      void handler
      throw new Error(`扩展 ${this.manifest.id} 无 Worker 宿主——内置扩展通道由 manager 转发`)
    }
    return this.deps.host.invokeWorker(this, 'invoke', { channel, payload }) as Promise<T>
  }

  /** 停用（注销 provider + 停止 + Worker 释放） */
  async disable(): Promise<void> {
    this.deps.unregisterProvider(this)
    if (this.worker) {
      void Promise.resolve(this.api?.stop?.()).catch(() => { })
      this.disposeWorker()
    } else {
      this.api?.dispose?.()
    }
    this.started = false
  }

  /** 释放 Worker（终止 + 清理） */
  disposeWorker(): void {
    this.deps.host.terminateWorker(this)
  }

  // ── 配置（持久化） ──

  /** 读取配置（secret 脱敏——返回副本） */
  getConfig(): Record<string, unknown> {
    return { ...this.config }
  }

  /** 保存配置（合并 patch + 原子写 config.json） */
  saveConfig(patch: Record<string, unknown>): void {
    Object.assign(this.config, patch)
    writeConfigFile(join(this.dir, 'config.json'), { enabled: this.enabled, config: this.config })
  }

  /** 持久化启停状态 */
  persistEnabled(): void {
    persistEnabled(this)
  }

  /** 状态（列表展示） */
  status(): ProviderStatus {
    const s = { loaded: this.api !== null, enabled: this.enabled, started: this.started }
    return {
      ...s,
      status: deriveStatus(s),
      detail: this.error,
    }
  }

  get configDir(): string {
    return this.dir
  }
}
