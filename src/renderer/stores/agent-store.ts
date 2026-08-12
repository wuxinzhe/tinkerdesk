/**
 * agent-store.ts — 当前 Agent 状态域
 *
 * 只保留跨组件共享的状态：currentAgent（聊天页 ChatListView/ChatDetailView 共用）。
 * agents 列表（AgentListView 组件内状态）、CRUD 转发（AgentEditView 直接调 agentsApi）均已组件化。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { agentsApi } from '@/renderer/api/agents-api'
import type { AgentInfo } from '@/renderer/api/types'

export const useAgentStore = defineStore('agent', () => {
  // ── 当前 Agent（跨组件共享）──
  const currentAgent = ref<AgentInfo | null>(null)
  const agentCache = new Map<string, AgentInfo>()

  async function loadCurrentAgent(profile: string, force = false) {
    if (!profile) {
      currentAgent.value = null
      return
    }
    // 缓存命中（非 force）直接用——编辑/创建后或切换 profile 时 force 重拉（防脏缓存）
    if (!force && agentCache.has(profile)) {
      currentAgent.value = agentCache.get(profile)!
      return
    }
    try {
      const agent = await agentsApi.get(profile)
      if (agent) {
        agentCache.set(profile, agent)
        currentAgent.value = agent
      }
    } catch {
      currentAgent.value = null
    }
  }

  /** 编辑/创建后失效缓存（下次 load 重新拉——避免脏数据） */
  function invalidateCache(profile?: string): void {
    if (profile) agentCache.delete(profile)
    else agentCache.clear()
  }

  return {
    currentAgent, loadCurrentAgent, invalidateCache
  }
})
