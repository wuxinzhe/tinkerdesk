/**
 * agent-store.ts — Agent 管理域
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { agentsApi } from '@/api/agents-api'
import type { AgentInfo, CreateAgentRequest, ModeOptionVO, UpdateAgentRequest } from '@/defines/models/agent'

export const useAgentStore = defineStore('agent', () => {
  const agents = ref<AgentInfo[]>([])
  const loading = ref(false)

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

  // ── 列表 ──
  async function list(): Promise<AgentInfo[]> {
    loading.value = true
    try {
      agents.value = await agentsApi.list()
      return agents.value
    } catch {
      agents.value = []
      return []
    } finally {
      loading.value = false
    }
  }

  async function get(profile: string): Promise<AgentInfo | null> {
    try {
      return await agentsApi.get(profile)
    } catch {
      return null
    }
  }

  async function create(req: CreateAgentRequest): Promise<AgentInfo | null> {
    try {
      return await agentsApi.create(req)
    } catch {
      return null
    }
  }

  async function update(profile: string, req: UpdateAgentRequest): Promise<AgentInfo | null> {
    try {
      return await agentsApi.update(profile, req)
    } catch {
      return null
    }
  }

  async function remove(profile: string): Promise<void> {
    await agentsApi.delete(profile)
  }

  async function listModes(): Promise<ModeOptionVO[]> {
    const modes = await agentsApi.listModes(true)
    return (modes as ModeOptionVO[]) ?? []
  }

  return {
    agents, loading,
    currentAgent, loadCurrentAgent,
    list, get, create, update, remove, listModes
  }
})
