/**
 * skills.api.ts — 数据层
 * 技能 API（本地 IPC，走 SkillController）
 * 本地无官方技能市场：listOfficial/get/install/upload 返回空/空实现
 */
import type { SkillInfo, SkillFileInfo, SkillCategory } from '@/renderer/api/types'
import type { ApiResponse } from '@/renderer/api/types'
import '@/renderer/api/types'

export class SkillsApi {
  /** 技能市场列表（npm 在线——真实 registry 查询——分类/搜索词透传） */
  async listOfficial(params?: { offset?: number; limit?: number; category?: string; name?: string; profile?: string }): Promise<{ items: SkillInfo[]; total: number; offset: number; limit: number }> {
    const res = await window.api.skills.marketList({ category: params?.category, search: params?.name, profile: params?.profile })
    const items = (res.items ?? []).map((m) => ({
      id: m.name,
      name: m.name.slice('tinkerdesk-skill-'.length),
      displayName: m.name.slice('tinkerdesk-skill-'.length),
      description: m.description,
      version: m.version,
      license: m.official ? '官方' : undefined,
      tags: m.categories,
      isInstalled: m.installed,
    }) as SkillInfo)
    return { items, total: items.length, offset: params?.offset ?? 0, limit: params?.limit ?? 100 }
  }

  /** 技能市场安装（npm 在线） */
  async installFromMarket(name: string, profile?: string): Promise<{ ok: boolean; error?: string; skillId?: string; name?: string }> {
    return window.api.skills.marketInstall(name, profile)
  }

  /** 本地无官方技能 */
  async get(_id: string): Promise<SkillInfo> {
    throw new Error('本地客户端无官方技能市场')
  }

  async categories(): Promise<SkillCategory[]> {
    const data = await window.api.skills.categories()
    return (data as SkillCategory[]) ?? []
  }

  async installed(params: { profile: string; offset?: number; limit?: number; category?: string; name?: string }): Promise<{ items: SkillInfo[]; total: number; offset: number; limit: number }> {
    const data = await window.api.skills.list({
      profile: params.profile,
      offset: params.offset ?? 0,
      limit: params.limit ?? 20,
    })
    return (data as { items: SkillInfo[]; total: number; offset: number; limit: number }) ?? { items: [], total: 0, offset: 0, limit: 0 }
  }

  /** 私有技能详情（按 id 走 IPC 查询，不依赖路由 state） */
  async detail(id: string, profile: string): Promise<SkillInfo | null> {
    const data = await window.api.skills.get(id, profile)
    return (data as SkillInfo) ?? null
  }

  /** 安装/创建技能（结构化写入——render 层已解析；name/body 必填） */
  async installFromMarkdown(payload: {
    profile?: string; name?: string; displayName?: string; description?: string; category?: string
    version?: string; author?: string; license?: string; platforms?: string; tags?: string
    dependencies?: string; requiresToolsets?: string; requiresTools?: string
    fallbackForToolsets?: string; fallbackForTools?: string; triggers?: string; triggerConditions?: string
    config?: string; envVars?: string; commands?: string; compatibility?: string; allowedTools?: string; metadata?: string; body?: string
    files?: Array<{ fileType: string; name?: string; content: string; sortOrder?: number }>
    related?: string[]
  }): Promise<SkillInfo> {
    const data = await window.api.skills.install(payload)
    return data as SkillInfo
  }

  /** 编辑技能（全字段） */
  async updateSkill(payload: {
    id: string; profile?: string; displayName?: string; description?: string; category?: string
    version?: string; author?: string; license?: string
    tags?: string; platforms?: string; dependencies?: string; requiresToolsets?: string; requiresTools?: string
    fallbackForToolsets?: string; fallbackForTools?: string; triggers?: string; triggerConditions?: string
    config?: string; envVars?: string; commands?: string; compatibility?: string; allowedTools?: string; metadata?: string; envs?: string; body?: string
    related?: string[]
  }): Promise<SkillInfo> {
    const data = await window.api.skills.update(payload)
    return data as SkillInfo
  }

  /** 删除技能（软删） */
  async deleteSkill(id: string, profile: string): Promise<void> {
    await window.api.skills.delete(id, profile)
  }

  /** 本地无官方技能安装 */
  async install(_skillId: string, _profile = 'default'): Promise<ApiResponse> {
    return { success: false, error: '本地客户端无官方技能市场' }
  }

  async activate(skillId: string, profile: string): Promise<ApiResponse> {
    try {
      await window.api.skills.activate(skillId, profile)
      return { success: true, data: null }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }

  async deactivate(skillId: string, profile: string): Promise<ApiResponse> {
    try {
      await window.api.skills.deactivate(skillId, profile)
      return { success: true, data: null }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }

  /** 本地无技能上传 */
  async upload(_file: File, _category?: string): Promise<{ id: string }> {
    throw new Error('本地客户端不支持技能上传')
  }

  // ── 技能文件 CRUD ──

  /** 按技能 id 查文件列表 */
  async listSkillFiles(skillId: string): Promise<SkillFileInfo[]> {
    const data = await window.api.skills.fileList(skillId)
    return data as SkillFileInfo[]
  }

  /** 新增技能文件（返回新 id） */
  async addSkillFile(payload: { skillId: string; fileType: string; name?: string; content?: string; language?: string; sortOrder?: number }): Promise<number> {
    return window.api.skills.fileSave(payload)
  }

  /** 更新技能文件 */
  async updateSkillFile(payload: { id: number; fileType?: string; name?: string; content?: string; language?: string; sortOrder?: number }): Promise<void> {
    await window.api.skills.fileUpdate(payload)
  }

  /** 删除技能文件 */
  async deleteSkillFile(id: number): Promise<void> {
    await window.api.skills.fileDelete(id)
  }
}

/** 默认实例 */
export const skillsApi = new SkillsApi()
