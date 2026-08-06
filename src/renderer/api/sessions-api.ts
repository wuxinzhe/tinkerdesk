/**
 * sessions.api.ts — 数据层
 * 会话管理 API（本地 IPC，走 SessionController）
 */
import type { Session } from '@/renderer/api/types'
import '@/renderer/api/types'

export class SessionsApi {
  async list(profile: string, limit = 50, offset = 0): Promise<Session[]> {
    const data = await window.api.sessions.list({ profile, limit, offset })
    return (data as Session[]) ?? []
  }

  async create(data: { profile?: string; title?: string }): Promise<Session> {
    return (await window.api.sessions.create(data)) as Session
  }

  async updateTitle(sessionId: string, title: string, profile: string): Promise<void> {
    await window.api.sessions.update(sessionId, title, profile)
  }
}

/** 默认实例 */
export const sessionsApi = new SessionsApi()
