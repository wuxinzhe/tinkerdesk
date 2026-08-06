/**
 * skills.api.ts — 数据层
 * 技能 API（本地 IPC，走 SkillController）
 * 本地无官方技能市场：listOfficial/get/install/upload 返回空/空实现
 */
import type { SkillInfo, SkillCategory } from '@/renderer/api/types'
import type { ApiResponse } from '@/renderer/api/types'
import '@/renderer/api/types'

export class SkillsApi {
  /** 本地无官方技能市场 */
  async listOfficial(_params?: { offset?: number; limit?: number; category?: string; name?: string; profile?: string }): Promise<{ items: SkillInfo[]; total: number; offset: number; limit: number }> {
    return { items: [], total: 0, offset: 0, limit: 0 }
  }

  /** 本地无官方技能 */
  async get(_id: string): Promise<SkillInfo> {
    throw new Error('本地客户端无官方技能市场')
  }

  async categories(): Promise<SkillCategory[]> {
    const data = await window.api.skills.categories()
    return (data as SkillCategory[]) ?? []
  }

  async installed(params: { profile?: string; offset?: number; limit?: number; category?: string; name?: string }): Promise<{ items: SkillInfo[]; total: number; offset: number; limit: number }> {
    const data = await window.api.skills.list({
      profile: params.profile ?? 'default',
      offset: params.offset ?? 0,
      limit: params.limit ?? 20,
    })
    return (data as { items: SkillInfo[]; total: number; offset: number; limit: number }) ?? { items: [], total: 0, offset: 0, limit: 0 }
  }

  /** 私有技能详情（按 id 走 IPC 查询，不依赖路由 state） */
  async detail(id: string, profile = 'default'): Promise<SkillInfo | null> {
    const data = await window.api.skills.get(id, profile)
    return (data as SkillInfo) ?? null
  }

  /** 本地无官方技能安装 */
  async install(_skillId: string, _profile = 'default'): Promise<ApiResponse> {
    return { success: false, error: '本地客户端无官方技能市场' }
  }

  async activate(skillId: string, profile = 'default'): Promise<ApiResponse> {
    try {
      await window.api.skills.activate(skillId, profile ?? 'default')
      return { success: true, data: null }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }

  async deactivate(skillId: string, profile = 'default'): Promise<ApiResponse> {
    try {
      await window.api.skills.deactivate(skillId, profile ?? 'default')
      return { success: true, data: null }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }

  /** 本地无技能上传 */
  async upload(_file: File, _category?: string): Promise<{ id: string }> {
    throw new Error('本地客户端不支持技能上传')
  }
}

/** 默认实例 */
export const skillsApi = new SkillsApi()
