/**
 * agent-api.ts — Agent 会话统一入口（local/remote 切换）
 *
 * 渲染层只依赖 AgentApi 接口；按 AgentTransportMode 选择实现：
 * - local：本地 AgentLoop（IPC）→ agent-local.ts
 * - remote：远端 showing-agent（WebSocket/HTTP）→ 复用 Backend / MessagesApi
 *
 * 数据结构同源（AgentMessageVO），切换模式无需改渲染层代码。
 */
import type {AgentApi, AgentTransportMode} from '@/defines/api/agent-api-types'
import {createLocalAgentApi} from './agent-local'

/** 当前通信模式（后续可做成配置/运行时切换） */
let currentMode: AgentTransportMode = 'local'

/** 已创建的实例（按模式缓存） */
const instances = new Map<AgentTransportMode, AgentApi>()

/** 设置通信模式 */
export function setAgentMode(mode: AgentTransportMode): void {
  currentMode = mode
  // 切换模式时清缓存，下次 getAgentApi 重建
  instances.delete(mode)
}

/** 获取当前模式 */
export function getAgentMode(): AgentTransportMode {
  return currentMode
}

/** 注册远程实现（远端联调时注入） */
export function registerRemoteAgentApi(api: AgentApi): void {
  instances.set('remote', api)
}

/** 获取 AgentApi（统一入口） */
export function getAgentApi(): AgentApi {
  const existing = instances.get(currentMode)
  if (existing) {
    return existing
  }

  if (currentMode === 'local') {
    // 懒创建本地实现（避免 preload 时序问题）
    const api = createLocalAgentApi()
    instances.set('local', api)
    return api
  }

  throw new Error('远程 Agent API 未注册，请先调用 registerRemoteAgentApi()')
}
