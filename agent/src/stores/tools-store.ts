/**
 * tools-store.ts — 工具管理域
 *
 * 职责：内建/桌面端/扩展工具的状态 + 工具 CRUD
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { toolsApi } from '@/api/tools-api'
import type { ToolItem } from '@/defines/tools/types'
import type { ApiResponse } from '@/defines/api/types'
import type { ToolEntry } from '@/defines/tools/store-types'

export const useToolsStore = defineStore('tools', () => {
  // ── 本地注册的工具（EventBus 推送）──
  const tools = ref<ToolEntry[]>([])
  const desktopTools = ref<ToolEntry[]>([])
  const extensionTools = ref<ToolEntry[]>([])
  const builtin = ref<ToolEntry[]>([])
  const extensions = ref<ToolEntry[]>([])

  function merge() { tools.value = [...desktopTools.value, ...extensionTools.value] }
  function setDesktopTools(t: ToolEntry[]) { desktopTools.value = t; merge() }
  function setExtensionTools(t: ToolEntry[]) { extensionTools.value = t; merge() }
  function registerTools(b: ToolEntry[], e: ToolEntry[]) { builtin.value = b; extensions.value = e }
  function getTool(id: string) { return tools.value.find(t => t.id === id) }
  function removeExtension(extensionId: string) {
    extensionTools.value = extensionTools.value.filter(t => t.extensionId !== extensionId)
    merge()
  }
  function $reset() {
    tools.value = []; desktopTools.value = []
    extensionTools.value = []; builtin.value = []; extensions.value = []
  }

  // ── API：工具配置 ──
  const loading = ref(false)

  async function list(profile = 'default'): Promise<ToolItem[]> {
    loading.value = true
    try {
      const items = await toolsApi.list(profile)
      return items
    } catch {
      return []
    } finally {
      loading.value = false
    }
  }

  async function toggle(toolName: string, disabled: boolean, profile = 'default'): Promise<ApiResponse> {
    return await toolsApi.toggle(toolName, disabled, profile)
  }

  return {
    // 本地注册
    tools, desktopTools, extensionTools, builtin, extensions,
    setDesktopTools, setExtensionTools, registerTools, getTool, removeExtension,
    // API
    loading, list, toggle,
    $reset
  }
})
