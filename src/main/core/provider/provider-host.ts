/**
 * provider-host.ts — 扩展 Worker 宿主（Worker 线程生命周期 + 通信桥）
 *
 * 职责：外部扩展的 Worker 线程管理——spawn/terminate——消息代理
 * （api/ctx 代理——调用转发 Worker——隔离执行）——与 ProviderManager 解耦：
 * 所有 manager 域回调（通道注册/事件转发/ready 处理）经 hooks 注入。
 */
import { renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getAppRootPath } from '../../utils/electron-app'
import { Worker } from 'worker_threads'
import type { ProviderApi, ProviderCheckResult, ProviderContext, ProviderHostHooks, ProviderRecord, ProviderStatus } from './types'

/** 扩展 Worker 宿主：Worker 生命周期 + 消息代理（每个 manager 一个实例） */
export class ProviderHost {
  private readonly workerCalls = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private workerCallSeq = 0

  constructor(private readonly hooks: ProviderHostHooks) { }

  /** 启动扩展 Worker（后台加载——ready 经 hooks.onReady 通知——main 事件循环零阻塞） */
  spawnWorker(record: ProviderRecord, dir: string, configFile: string, config: Record<string, unknown>): void {
    const worker = new Worker(join(getAppRootPath(), 'out', 'main', 'provider-host-worker.js'), {
      workerData: { providerDir: dir, entry: record.manifest.entry, manifest: record.manifest, configFile },
    })
    record.worker = worker

    // 代理 api/ctx：方法调用转发 Worker（现有代码 record.api/ctx 直接调用——零改动）
    record.api = this.createWorkerApiProxy(record)
    record.ctx = this.createWorkerCtxProxy(record, dir, config)

    worker.on('message', (msg: { type: string; callId?: number; ok?: boolean; data?: unknown; error?: string; event?: string; channels?: string[] }) => {
      if (msg.type === 'ready') {
        this.hooks.onReady(record, msg.channels ?? [])
        return
      }
      if (msg.type === 'result') {
        const call = this.workerCalls.get(msg.callId ?? -1)
        if (!call) return
        this.workerCalls.delete(msg.callId ?? -1)
        if (msg.ok) call.resolve(msg.data)
        else call.reject(new Error(msg.error ?? '扩展调用失败'))
        return
      }
      if (msg.type === 'emit') {
        this.hooks.onEmit(record.manifest.id, msg.event ?? '', msg.data)
        return
      }
      if (msg.type === 'fatal') {
        this.hooks.onFatal(record, msg.error ?? '扩展 Worker 异常')
        return
      }
    })

    worker.on('error', (err) => {
      record.error = err.message
      console.error(`[provider] ${record.manifest.id} Worker 异常:`, err.message)
    })

    worker.on('exit', (code) => {
      if (record.worker === worker) record.worker = null
      // 非正常退出（非 terminate）——清除挂起调用
      if (code !== 0) {
        for (const [id, call] of this.workerCalls) {
          if ((call as unknown as { worker?: Worker }).worker === worker) {
            this.workerCalls.delete(id)
            call.reject(new Error(`扩展 ${record.manifest.id} Worker 已退出 (code=${code})`))
          }
        }
      }
    })
  }

  /** 终止 Worker（先 terminate——再清理该扩展的挂起调用） */
  terminateWorker(record: ProviderRecord): void {
    if (record.worker) {
      try {
        record.worker.terminate()
      } catch {
        // 忽略终止错误
      }
      record.worker = null
    }
    for (const [id, call] of this.workerCalls) {
      if ((call as unknown as { providerId?: string }).providerId === record.manifest.id) {
        this.workerCalls.delete(id)
        call.reject(new Error(`扩展 ${record.manifest.id} 已终止`))
      }
    }
  }

  /** 调用 Worker 执行（invoke handler / call 生命周期方法）——消息代理 + Promise */
  invokeWorker(record: ProviderRecord, type: 'invoke' | 'call', body: Record<string, unknown>): Promise<unknown> {
    const worker = record.worker
    if (!worker) return Promise.reject(new Error(`扩展 ${record.manifest.id} Worker 不可用`))
    const callId = ++this.workerCallSeq
    return new Promise((resolve, reject) => {
      this.workerCalls.set(callId, { resolve, reject })
        ; (this.workerCalls.get(callId) as unknown as { worker?: Worker }).worker = worker
      worker.postMessage({ type, callId, ...body })
    })
  }

  /** Worker 扩展的 api 代理（方法调用 → Worker 执行——现有代码 record.api.check() 等零改动） */
  private createWorkerApiProxy(record: ProviderRecord): ProviderApi {
    const call = (method: string): Promise<unknown> => this.invokeWorker(record, 'call', { method })
    return {
      // check 契约是同步返回——代理异步（调用方 await 场景安全；类型上兼容）
      check: (() => call('check')) as unknown as () => ProviderCheckResult,
      start: () => call('start') as Promise<void>,
      stop: () => call('stop') as Promise<void>,
      dispose: () => call('dispose') as Promise<void>,
      getStatus: () => call('getStatus') as Promise<ProviderStatus>,
    }
  }

  /** Worker 扩展的 ctx 代理（读写转发 Worker——与 main 直跑版接口一致） */
  private createWorkerCtxProxy(record: ProviderRecord, _dir: string, config: Record<string, unknown>): ProviderContext {
    const self = this
    return {
      providerId: record.manifest.id,
      configDir: _dir,
      getManifest: () => record.manifest,
      emit: (event, data) => self.hooks.onEmit(record.manifest.id, event, data),
      registerIpc: (channel, handler) => {
        // Worker 侧由扩展自身 registerIpc——代理侧不需要（invoke 直发 Worker）
        void channel
        void handler
      },
      getConfig: <T>() => config as T,
      setConfig: (patch) => {
        Object.assign(config, patch)
        // 写回 config.json（保留 enabled 字段——原子写）
        try {
          const file = join(_dir, 'config.json')
          const current = { enabled: record.enabled, config }
          const tmp = `${file}.tmp`
          writeFileSync(tmp, JSON.stringify(current, null, 2), 'utf-8')
          renameSync(tmp, file)
        } catch (e) {
          console.error(`[provider] ${record.manifest.id} setConfig 失败:`, (e as Error).message)
        }
      },
    }
  }
}
