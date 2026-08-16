/**
 * plugin-loader.ts — 插件加载与注册编排（manifest 校验 → record 构建 → Worker 加载 → 自检注册）
 *
 * 与 PluginManager 解耦：loader 收依赖（registry 注册表引用 / PluginHost /
 * ProviderRegistry / IPC 接线回调）——manager 只做对外编排调用。
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { PluginCheckResult, PluginManifest, PluginRecord } from './types'
import { matchSystemInterfaces } from './system-interfaces'
import type { PluginHost } from './plugin-host'
import type { ProviderRegistry } from './plugin-registry'
import { readConfigFile } from './plugin-store'

/** PluginLoader 依赖（manager 注入——避免反向依赖） */
export interface PluginLoaderDeps {
  registry: Map<string, PluginRecord>
  host: PluginHost
  providerRegistry: ProviderRegistry
  /** 注册插件声明的 IPC 通道（manager 安全接线） */
  registerIpc: (pluginId: string, channel: string, handler: (payload: unknown) => unknown) => void
  /** 查询插件是否已注册某通道（接口契约校验用） */
  hasChannel: (pluginId: string, channel: string) => boolean
  /** 插件事件转发 renderer */
  forwardEvent: (pluginId: string, event: string, data?: unknown) => void
}

/** 插件加载与注册编排 */
export class PluginLoader {
  constructor(private readonly deps: PluginLoaderDeps) { }

  /** 校验并加载单个插件（读 manifest → Worker 宿主加载——骨架同步返回——后台加载） */
  load(dir: string): void {
    const { registry, host } = this.deps
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
    if (registry.has(manifest.id)) {
      throw new Error(`插件已存在: ${manifest.id}`)
    }

    const configFile = join(dir, 'config.json')
    const { enabled, config } = readConfigFile(configFile)

    const record: PluginRecord = {
      manifest,
      api: null,
      ctx: null,
      enabled,
      started: false,
      worker: null,
    }
    registry.set(manifest.id, record)

    // 在 Worker 线程加载执行插件（外部插件不可信——线程隔离——同步/死循环/CPU 密集
    // 阻塞的只是 Worker 自己的线程——main 事件循环零影响）
    try {
      host.spawnWorker(record, dir, configFile, config)
    } catch (e) {
      record.error = (e as Error).message
      console.error(`[plugin] ${manifest.id} Worker 启动失败:`, record.error)
    }
  }

  /** Worker ready（PluginHost 回调）：注册 IPC 通道 + 接口契约校验 + 自动注册 */
  onWorkerReady(record: PluginRecord, channels: string[]): void {
    const { registerIpc, hasChannel, host } = this.deps
    for (const channel of channels) {
      registerIpc(record.manifest.id, channel, (payload) => host.invokeWorker(record, 'invoke', { channel, payload }))
    }
    // 接口契约校验：声明的系统开放接口必须注册了 requiredChannel
    for (const def of matchSystemInterfaces(record.manifest.systemInterfaces)) {
      if (def.requiredChannel && !hasChannel(record.manifest.id, def.requiredChannel)) {
        record.error = `声明了接口 ${def.id} 但未注册契约频道 ${def.requiredChannel}（插件契约 v1）`
        console.error(`[plugin] ${record.manifest.id}: ${record.error}`)
        host.terminateWorker(record)
        return
      }
    }
    console.log(`[plugin] 已加载 ${record.manifest.id}@${record.manifest.version} (${record.manifest.capabilities?.join(',') ?? '无能力'})`)
    if (record.enabled) {
      this.autoRegister(record)
    }
  }

  /** Worker fatal（PluginHost 回调）：记录错误 + 终止 */
  onWorkerFatal(record: PluginRecord, error: string): void {
    record.error = error
    console.error(`[plugin] ${record.manifest.id} Worker 错误:`, error)
    this.deps.host.terminateWorker(record)
  }

  /** 启动时自动注册（持久化 enabled 且自检通过才真正 start；未就绪保持 enabled 标记等待修复） */
  autoRegister(record: PluginRecord): void {
    const { host, providerRegistry } = this.deps
    // 内置插件（可信——main 直跑）：本地自检
    if (!record.worker) {
      if (!record.api) return
      try {
        const check = record.api.check()
        if (check && check.ok) {
          void record.api.start?.()
          record.started = true
          providerRegistry.register(record)
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
    void host.invokeWorker(record, 'call', { method: 'check' })
      .then((check) => {
        const c = check as PluginCheckResult | boolean | undefined
        const ok = typeof c === 'boolean' ? c : !!c?.ok
        if (!ok) {
          console.warn(`[plugin] ${record.manifest.id} 配置为启用但自检未通过，等待配置完成后重新启用`)
          return
        }
        return host.invokeWorker(record, 'call', { method: 'start' }).then(() => {
          record.started = true
          providerRegistry.register(record)
          console.log(`[plugin] 自动注册 ${record.manifest.id}（自检通过）`)
        })
      })
      .catch((e) => {
        console.error(`[plugin] 自动注册失败 ${record.manifest.id}:`, (e as Error).message)
      })
  }
}
