/**
 * tool-center-store.ts — MCP 工具中心管理域
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getToolCenterApi } from '@/api/tool-center-api'
import type { McpServerConfig, McpServerState, ToolCenterState } from '@/api/tool-center-api'
export type { McpServerConfig, McpServerState, ToolCenterState }

export const useToolCenterStore = defineStore('toolCenter', () => {
  const api = getToolCenterApi()
  const servers = ref<McpServerState[]>([])
  const loading = ref(false)

  async function getState(): Promise<ToolCenterState> {
    loading.value = true
    try {
      const state = await api.getState()
      servers.value = state.mcpServers
      return state
    } finally {
      loading.value = false
    }
  }

  async function upsertMcpServer(config: McpServerConfig): Promise<ToolCenterState> {
    const state = await api.upsertMcpServer(config)
    servers.value = state.mcpServers
    return state
  }

  async function removeMcpServer(name: string): Promise<ToolCenterState> {
    const state = await api.removeMcpServer(name)
    servers.value = state.mcpServers
    return state
  }

  return {
    servers, loading,
    getState, upsertMcpServer, removeMcpServer
  }
})
