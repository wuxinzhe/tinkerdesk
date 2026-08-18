/**
 * provider-host-worker.ts — 扩展宿主 Worker（worker_threads）
 *
 * 外部扩展在独立 Worker 线程加载执行——扩展代码（无论同步/CPU 密集/恶意阻塞）
 * 阻塞的只是自己的 Worker 线程——main 进程事件循环零影响。
 *
 * HostBridge 类封装 worker 侧全部状态与协议处理（ipc 注册表/通道上报/
 * 配置读写/消息循环）——模块入口只做薄初始化（new + start）。
 *
 * 通信协议（main ↔ worker）：
 *   main → worker:
 *     { type: 'call', method: 'check'|'start'|'stop', callId }         扩展生命周期方法
 *     { type: 'invoke', channel, payload, callId }                     调用扩展注册的 IPC handler
 *     { type: 'shutdown' }                                             退出
 *   worker → main:
 *     { type: 'ready', ok: true }                                      扩展 init 完成
 *     { type: 'result', callId, ok, data }                             调用结果
 *     { type: 'emit', event, data }                                    扩展 ctx.emit 转发
 *     { type: 'fatal', message }                                       扩展加载/执行致命错误
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { parentPort, workerData, type MessagePort } from 'worker_threads'
import type { HostData, ProviderApi, ProviderContext, ProviderManifest, TinkerProvider } from './types'

/** Worker 侧宿主桥：状态封装 + 协议处理（每个 Worker 一个实例） */
class HostBridge {
  private readonly port: MessagePort
  private readonly data: HostData
  private readonly manifest: ProviderManifest
  private readonly providerDir: string
  private readonly entry: string
  /** worker 内 IPC 注册表（扩展 ctx.registerIpc → 本地 map——由 invoke 消息触发） */
  private readonly ipcHandlers = new Map<string, (payload: unknown) => unknown>()
  /** 注册的通道名（ready 时上报 main——main 为每个通道注册 IPC 代理） */
  private readonly registeredChannels: string[] = []
  private api: ProviderApi | null = null

  constructor(port: MessagePort, data: HostData) {
    this.port = port
    this.data = data
    this.manifest = data.manifest
    this.providerDir = data.providerDir
    this.entry = data.entry
  }

  /** 启动：加载扩展 → init → ready/fatal → 绑定消息循环 */
  start(): void {
    try {
      const provider = this.loadEntry()
      if (typeof provider.init !== 'function') {
        throw new Error(`${this.manifest.id} 未实现 init() 接口`)
      }
      this.api = provider.init(this.createContext())
      if (typeof this.api.check !== 'function') {
        throw new Error(`${this.manifest.id} 未实现 check() 自检接口（扩展契约 v1 强制）`)
      }
      this.send({ type: 'ready', ok: true, channels: this.registeredChannels })
    } catch (e) {
      this.send({ type: 'fatal', message: (e as Error).message ?? String(e) })
      return
    }
    this.port.on('message', (msg) => void this.handleMessage(msg))
  }

  /** 加载扩展入口（CommonJS——相对扩展目录解析依赖） */
  private loadEntry(): TinkerProvider {
    const entryPath = join(this.providerDir, this.entry)
    try {
      delete require.cache[require.resolve(entryPath)]
    } catch {
      // 首次加载无缓存
    }
    const entryModule = require(entryPath) as { default?: TinkerProvider } | TinkerProvider
    return (entryModule as { default?: TinkerProvider }).default ?? (entryModule as TinkerProvider)
  }

  /** worker 内配置（读文件——文件是唯一真相源） */
  private loadConfig(): Record<string, unknown> {
    try {
      if (!existsSync(this.data.configFile)) return {}
      const raw = JSON.parse(readFileSync(this.data.configFile, 'utf-8'))
      return raw && typeof raw === 'object' && 'config' in raw
        ? ((raw as { config: Record<string, unknown> }).config ?? {})
        : raw
    } catch {
      return {}
    }
  }

  private send(msg: Record<string, unknown>): void {
    this.port.postMessage(msg)
  }

  /** 扩展上下文（与 main 直跑版 ctx 接口一致——扩展代码零改动） */
  private createContext(): ProviderContext {
    const self = this
    return {
      providerId: self.manifest.id,
      configDir: self.providerDir,
      getManifest: () => self.manifest,
      emit: (event, data) => self.send({ type: 'emit', event, data }),
      registerIpc: (channel, handler) => {
        if (self.ipcHandlers.has(channel)) {
          console.warn(`[provider-host] ${self.manifest.id}:${channel} 已注册，跳过`)
          return
        }
        self.ipcHandlers.set(channel, handler)
        self.registeredChannels.push(channel)
      },
      getConfig: <T>() => self.loadConfig() as T,
      setConfig: (patch) => {
        // 写回 config.json（保留 enabled 字段）
        try {
          let current: Record<string, unknown> = {}
          try {
            const raw = JSON.parse(readFileSync(self.data.configFile, 'utf-8'))
            if (raw && typeof raw === 'object' && 'enabled' in raw) {
              current = { enabled: raw.enabled, config: { ...raw.config, ...patch } }
            } else {
              current = { enabled: false, config: { ...raw, ...patch } }
            }
          } catch {
            current = { enabled: false, config: patch }
          }
          const tmp = `${self.data.configFile}.tmp`
          writeFileSync(tmp, JSON.stringify(current, null, 2), 'utf-8')
          renameSync(tmp, self.data.configFile)
        } catch (e) {
          console.error(`[provider-host] ${self.manifest.id} setConfig 失败:`, (e as Error).message)
        }
      },
    }
  }

  /** 消息循环（call/invoke/shutdown——异常统一 result 错误回） */
  private async handleMessage(msg: { type: string; callId?: number; method?: string; channel?: string; payload?: unknown }): Promise<void> {
    try {
      if (msg.type === 'shutdown') {
        try { await this.api?.stop?.() } catch { /* 忽略停止错误 */ }
        this.port.close()
        return
      }
      if (msg.type === 'call') {
        const method = msg.method as string
        const fn = (this.api as Record<string, unknown> | null)?.[method]
        const result = typeof fn === 'function' ? await (fn as () => unknown).call(this.api) : undefined
        this.send({ type: 'result', callId: msg.callId, ok: true, data: result })
        return
      }
      if (msg.type === 'invoke') {
        const channel = msg.channel as string
        const handler = this.ipcHandlers.get(channel)
        if (!handler) {
          this.send({ type: 'result', callId: msg.callId, ok: false, error: `扩展 ${this.manifest.id} 未注册能力 ${channel}` })
          return
        }
        const result = await handler(msg.payload)
        this.send({ type: 'result', callId: msg.callId, ok: true, data: result })
        return
      }
    } catch (e) {
      this.send({ type: 'result', callId: msg.callId, ok: false, error: (e as Error).message ?? String(e) })
    }
  }
}

// ── Worker 入口（薄初始化） ──
const port = parentPort
if (!port) throw new Error('provider-host-worker 必须运行在 worker_threads 中')

const bridge = new HostBridge(port, workerData as HostData)
bridge.start()

// worker 未捕获异常 → 通知 main（不静默）
process.on('uncaughtException', (e) => {
  port.postMessage({ type: 'fatal', message: `uncaughtException: ${e.message}` })
})
