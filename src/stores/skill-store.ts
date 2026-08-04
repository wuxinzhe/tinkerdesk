/**
 * skill-store.ts — 技能管理域
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { skillsApi } from '@/api/skills-api'
import type { SkillInfo, SkillCategory } from '@/defines/models/skill'
import type { ApiResponse } from '@/defines/api/types'

export const useSkillStore = defineStore('skill', () => {
  const loading = ref(false)

  async function listOfficial(params?: {
    offset?: number; limit?: number; category?: string; name?: string; profile?: string
  }): Promise<{ items: SkillInfo[]; total: number }> {
    loading.value = true
    try {
      return await skillsApi.listOfficial(params)
    } catch {
      return { items: [], total: 0 }
    } finally {
      loading.value = false
    }
  }

  async function get(id: string): Promise<SkillInfo | null> {
    try {
      return await skillsApi.get(id)
    } catch {
      return null
    }
  }

  async function categories(): Promise<SkillCategory[]> {
    try {
      return await skillsApi.categories()
    } catch {
      return []
    }
  }

  async function installed(params: {
    profile: string; offset?: number; limit?: number
    category?: string; name?: string
  }): Promise<{ items: SkillInfo[]; total: number }> {
    loading.value = true
    try {
      return await skillsApi.installed(params)
    } catch {
      return { items: [], total: 0 }
    } finally {
      loading.value = false
    }
  }

  async function install(skillId: string, profile = 'default'): Promise<ApiResponse> {
    return await skillsApi.install(skillId, profile)
  }

  async function activate(skillId: string, profile = 'default'): Promise<ApiResponse> {
    return await skillsApi.activate(skillId, profile)
  }

  async function deactivate(skillId: string, profile = 'default'): Promise<ApiResponse> {
    return await skillsApi.deactivate(skillId, profile)
  }

  return {
    loading,
    listOfficial, get, categories,
    installed, install, activate, deactivate
  }
})
