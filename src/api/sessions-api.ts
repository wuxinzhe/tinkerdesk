/**
 * sessions.api.ts — 数据层
 * 会话管理 API
 */
import { HttpClient, http as defaultHttp } from './http-client'
import type { Session } from '@/defines/models/session'

export class SessionsApi {
  constructor(private http: HttpClient) {}

  async list(profile: string, limit = 50, offset = 0): Promise<Session[]> {
    const res = await this.http.get<Session[]>('/sessions', {
      params: { profile, limit, offset }
    })
    return res.data ?? []
  }

  async create(data: { profile?: string; title?: string }): Promise<Session> {
    const res = await this.http.post<Session>('/sessions', data)
    return res.data!
  }

  async updateTitle(sessionId: string, title: string): Promise<void> {
    await this.http.put(`/sessions/${sessionId}`, { title })
  }
}

/** 默认实例 */
export const sessionsApi = new SessionsApi(defaultHttp)
