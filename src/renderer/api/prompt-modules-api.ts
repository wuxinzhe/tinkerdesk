/**
 * prompt-modules.api.ts — 数据层
 * 提示词模块 API（本地 IPC，走 PromptModuleController）
 */
import type { PromptModuleData } from '@/renderer/api/types'
import '@/renderer/api/types'

export class PromptModulesApi {
  async list(profile: string): Promise<PromptModuleData[]> {
    const data = await window.api.promptModules.list(profile)
    return (data as PromptModuleData[]) ?? []
  }

  async create(profile: string, name: string, content: string): Promise<PromptModuleData> {
    return (await window.api.promptModules.create(name, content, profile, true)) as PromptModuleData
  }

  async update(id: number, name: string, content: string, profile: string): Promise<PromptModuleData> {
    return (await window.api.promptModules.update(id, name, content, profile)) as PromptModuleData
  }

  async delete(id: number, profile: string): Promise<void> {
    await window.api.promptModules.delete(id, profile)
  }

  async toggle(id: number, profile: string, enabled: boolean): Promise<void> {
    await window.api.promptModules.toggle(id, enabled, profile)
  }
}

/** 默认实例 */
export const promptModulesApi = new PromptModulesApi()
