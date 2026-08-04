/**
 * http-client.ts — 数据层
 * HTTP 客户端封装（axios）。统一管理 token、baseUrl、错误处理。
 * 可实例化，支持构造注入 baseUrl，Web 和 Desktop 共用。
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { ApiError, type ApiResponse } from '@/defines/api/types'

/** 401 统一处理：清 token → 跳转 splash */
export function handleUnauthorized(): void {
  clearTokens()
  sessionStorage.removeItem('app_initialized')
  window.location.hash = '#/splash'
}

// ── Token 管理（模块级，所有 HttpClient 实例共享） ──

let accessToken: string | null = localStorage.getItem('access_token')
let refreshToken: string | null = localStorage.getItem('refresh_token')

export function setTokens(access: string, refresh?: string): void {
  accessToken = access
  if (refresh) refreshToken = refresh
  localStorage.setItem('access_token', access)
  if (refresh) localStorage.setItem('refresh_token', refresh)
}

export function clearTokens(): void {
  accessToken = null
  refreshToken = null
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}

export function loadTokensFromStorage(): void {
  accessToken = localStorage.getItem('access_token')
  refreshToken = localStorage.getItem('refresh_token')
}

export function isAuthenticated(): boolean {
  return !!accessToken
}

export function getAccessToken(): string | null {
  return accessToken
}

export function getRefreshToken(): string | null {
  return refreshToken
}

// ── 模块级 connectId 存取（前端自己生成的 UUID，见 ws-client.ts） ──

let _connectId = ''
/**
 * 获取 STOMP sessionId（connectId），用于 REST API 关联 WebSocket 会话。
 * Web 端由 ws-client.ts 在 onConnect 时设置。
 * Electron 桌面端无 WS 连接时返回空字符串，API 层自行跳过 connectId 参数。
 */
export function getConnectId(): string { return _connectId }
/** 设置 connectId（由 ws-client.ts 在收到 tools_registered 事件时调用） */
export function setConnectId(id: string) { _connectId = id }

// ── HttpClient 类 ──

export class HttpClient {
  private client: AxiosInstance

  constructor(baseUrl: string) {
    this.client = axios.create({
      baseURL: baseUrl,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000
    })

    // Request 拦截器：自动注入 token
    this.client.interceptors.request.use((config) => {
      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`
      }
      return config
    })

    // Response 拦截器：统一错误处理
    this.client.interceptors.response.use(
      (res) => res,
      (error: AxiosError<ApiResponse>) => {
        const data = error.response?.data
        const status = error.response?.status ?? 0

        if (status === 401) {
          handleUnauthorized()
          return Promise.reject(
            new ApiError(status, data?.error ?? error.message ?? '未授权，请重新登录', data)
          )
        }

        const msg = data?.error ?? error.message ?? '请求失败'
        return Promise.reject(new ApiError(status, msg, data))
      }
    )
  }

  async get<T>(path: string, config?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const res = await this.client.get<ApiResponse<T>>(path, config)
    return res.data
  }

  async post<T>(path: string, body?: unknown, config?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const res = await this.client.post<ApiResponse<T>>(path, body, config)
    return res.data
  }

  async put<T>(path: string, body?: unknown, config?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const res = await this.client.put<ApiResponse<T>>(path, body, config)
    return res.data
  }

  async del<T>(path: string, config?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const res = await this.client.delete<ApiResponse<T>>(path, config)
    return res.data
  }

  async patch<T>(path: string, body?: unknown, config?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const res = await this.client.patch<ApiResponse<T>>(path, body, config)
    return res.data
  }
}

/** 默认实例 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
export const http = new HttpClient(BASE_URL)
