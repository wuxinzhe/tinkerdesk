/**
 * plugin-host-worker.ts — 插件宿主 Worker（worker_threads）
 *
 * 外部插件在独立 Worker 线程加载执行——插件代码（无论同步/CPU 密集/恶意阻塞）
 * 阻塞的只是自己的 Worker 线程——main 进程事件循环零影响。
 *
 * 通信协议（main ↔ worker）：
 *   main → worker:
 *     { type: 'call', method: 'check'|'start'|'stop', callId }         插件生命周期方法
 *     { type: 'invoke', channel, payload, callId }                     调用插件注册的 IPC handler
 *     { type: 'shutdown' }                                             退出
 *   worker → main:
 *     { type: 'ready', ok: true }                                      插件 init 完成
 *     { type: 'result', callId, ok, data }                             调用结果
 *     { type: 'emit', event, data }                                    插件 ctx.emit 转发
 *     { type: 'fatal', message }                                       插件加载/执行致命错误
 */
import { parentPort, workerData } from 'worker_threads'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { HostData, PluginApi, PluginContext, PluginManifest, TinkerPlugin } from './types'

const port = parentPort
if (!port) throw new Error('plugin-host-worker 必须运行在 worker_threads 中')

const data = workerData as HostData
const { pluginDir, entry, manifest } = data

/** worker 内 IPC 注册表（插件 ctx.registerIpc → 本地 map——由 invoke 消息触发） */
const ipcHandlers = new Map<string, (payload: unknown) => unknown>()
/** 注册的通道名（ready 时上报 main——main 为每个通道注册 IPC 代理） */
const registeredChannels: string[] = []

/** worker 内配置（读文件——文件是唯一真相源） */
function loadConfig(): Record<string, unknown> {
  try {
    if (!existsSync(data.configFile)) return {}
    const raw = JSON.parse(readFileSync(data.configFile, 'utf-8'))
    return raw && typeof raw === 'object' && 'config' in raw
      ? ((raw as { config: Record<string, unknown> }).config ?? {})
      : raw
  } catch {
    return {}
  }
}

function send(msg: Record<string, unknown>): void {
  port!.postMessage(msg)
}

/** 插件上下文（与 main 直跑版 ctx 接口一致——插件代码零改动） */
const ctx: PluginContext = {
  pluginId: manifest.id,
  configDir: pluginDir,
  getManifest: () => manifest,
  emit: (event, data2) => send({ type: 'emit', event, data: data2 }),
  registerIpc: (channel, handler) => {
    if (ipcHandlers.has(channel)) {
      console.warn(`[plugin-host] ${manifest.id}:${channel} 已注册，跳过`)
      return
    }
    ipcHandlers.set(channel, handler)
    registeredChannels.push(channel)
  },
  getConfig: <T>() => loadConfig() as T,
  setConfig: (patch) => {
    // 写回 config.json（保留 enabled 字段）
    try {
      const { writeFileSync, renameSync } = require('fs') as typeof import('fs')
      let current: Record<string, unknown> = {}
      try {
        const raw = JSON.parse(readFileSync(data.configFile, 'utf-8'))
        if (raw && typeof raw === 'object' && 'enabled' in raw) {
          current = { enabled: raw.enabled, config: { ...raw.config, ...patch } }
        } else {
          current = { enabled: false, config: { ...raw, ...patch } }
        }
      } catch {
        current = { enabled: false, config: patch }
      }
      const tmp = `${data.configFile}.tmp`
      writeFileSync(tmp, JSON.stringify(current, null, 2), 'utf-8')
      renameSync(tmp, data.configFile)
    } catch (e) {
      console.error(`[plugin-host] ${manifest.id} setConfig 失败:`, (e as Error).message)
    }
  },
}

/** 加载插件入口（CommonJS——相对插件目录解析依赖） */
function loadEntry(): TinkerPlugin {
  const entryPath = join(pluginDir, entry)
  try {
    delete require.cache[require.resolve(entryPath)]
  } catch {
    // 首次加载无缓存
  }
  const entryModule = require(entryPath) as { default?: TinkerPlugin } | TinkerPlugin
  return (entryModule as { default?: TinkerPlugin }).default ?? (entryModule as TinkerPlugin)
}

let api: PluginApi | null = null

try {
  const plugin = loadEntry()
  if (typeof plugin.init !== 'function') {
    throw new Error(`${manifest.id} 未实现 init() 接口`)
  }
  api = plugin.init(ctx)
  if (typeof api.check !== 'function') {
    throw new Error(`${manifest.id} 未实现 check() 自检接口（插件契约 v1 强制）`)
  }
  send({ type: 'ready', ok: true, channels: registeredChannels })
} catch (e) {
  send({ type: 'fatal', message: (e as Error).message ?? String(e) })
}

/** 消息循环 */
port.on('message', async (msg: { type: string; callId?: number; method?: string; channel?: string; payload?: unknown }) => {
  try {
    if (msg.type === 'shutdown') {
      try { await api?.stop?.() } catch { /* 忽略停止错误 */ }
      port!.close()
      return
    }
    if (msg.type === 'call') {
      const method = msg.method as string
      const fn = (api as Record<string, unknown> | null)?.[method]
      const result = typeof fn === 'function' ? await (fn as () => unknown).call(api) : undefined
      send({ type: 'result', callId: msg.callId, ok: true, data: result })
      return
    }
    if (msg.type === 'invoke') {
      const channel = msg.channel as string
      const handler = ipcHandlers.get(channel)
      if (!handler) {
        send({ type: 'result', callId: msg.callId, ok: false, error: `插件 ${manifest.id} 未注册能力 ${channel}` })
        return
      }
      const result = await handler(msg.payload)
      send({ type: 'result', callId: msg.callId, ok: true, data: result })
      return
    }
  } catch (e) {
    send({ type: 'result', callId: msg.callId, ok: false, error: (e as Error).message ?? String(e) })
  }
})

// worker 未捕获异常 → 通知 main（不静默）
process.on('uncaughtException', (e) => {
  send({ type: 'fatal', message: `uncaughtException: ${e.message}` })
})
