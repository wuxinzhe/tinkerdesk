/**
 * auth.api.ts — 数据层
 * 认证相关 API（注册/登录/刷新/登出/初始化）
 */
import { HttpClient, setTokens, clearTokens } from './http-client'
import { http as defaultHttp } from './http-client'
import type { TokenResponse, InitStatusResponse, InitCheckItem, EmailCodeResponse } from '@/defines/api/auth-types'

export class AuthApi {
  constructor(private http: HttpClient) {}

  /** 发送邮箱验证码 */
  async sendEmailCode(email: string): Promise<EmailCodeResponse> {
    const res = await this.http.post<EmailCodeResponse>('/auth/email-code', { email })
    return res.data!
  }

  async register(data: {
    email: string
    password: string
    nickname?: string
    code?: string
  }): Promise<TokenResponse> {
    const res = await this.http.post<TokenResponse>('/auth/register', data)
    if (res.data) {
      setTokens(res.data.token, res.data.refreshToken)
    }
    return res.data!
  }

  async login(email: string, password: string): Promise<TokenResponse> {
    const res = await this.http.post<TokenResponse>('/auth/login', { email, password })
    if (res.data) {
      setTokens(res.data.token, res.data.refreshToken)
    }
    return res.data!
  }

  async refresh(): Promise<TokenResponse | null> {
    const refreshToken = localStorage.getItem('refresh_token')
    if (!refreshToken) return null
    const res = await this.http.post<TokenResponse>('/auth/refresh', { refreshToken })
    if (res.data) {
      setTokens(res.data.token, res.data.refreshToken)
      return res.data
    }
    return null
  }

  async logout(): Promise<void> {
    await this.http.post('/auth/logout')
    clearTokens()
  }

  async initAccount(data: {
    nickname: string
    llmProvider: string
    llmModel: string
    llmApiKey: string
    llmBaseUrl?: string
  }): Promise<void> {
    await this.http.post('/account/init-account', data)
  }

  /** 查询账号初始化状态 */
  async getInitStatus(): Promise<InitStatusResponse> {
    const res = await this.http.get<InitStatusResponse>('/account/init-status')
    return res.data!
  }
}

/** 便捷退出：清 token → 跳转 splash */
export async function logoutAndClear(): Promise<void> {
  try {
    await defaultHttp.post('/auth/logout')
  } catch { /* ignore */ }
  clearTokens()
  sessionStorage.removeItem('app_initialized')
  window.location.hash = '#/splash'
}

/** 默认实例 */
export const authApi = new AuthApi(defaultHttp)
