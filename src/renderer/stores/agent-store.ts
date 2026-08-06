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

  async function loadCurrentAgent(profile: string) {
    if (!profile) {
      currentAgent.value = null
      return
    }
    if (agentCache.has(profile)) {
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

  return {
    currentAgent, loadCurrentAgent
  }
})
