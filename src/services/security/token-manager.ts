/**
 * token-manager.ts — 服务层
 * Token 管理器。View 层通过此服务访问 token，禁止直接操作 localStorage 或 http-client。
 */
import { 
  isAuthenticated, getAccessToken, getRefreshToken, 
  setTokens, clearTokens, loadTokensFromStorage 
} from '@/api/http-client'

export class TokenManager {
  /** 从 localStorage 加载 token 到内存（页面加载后调用） */
  loadFromStorage(): void {
    loadTokensFromStorage()
  }

  /** 是否有有效的 refresh token（可尝试刷新登录态） */
  hasRefreshToken(): boolean {
    return !!getRefreshToken()
  }

  /** 是否有 access token（内存中，可能已过期） */
  hasAccessToken(): boolean {
    return !!getAccessToken()
  }

  /** 获取 access token */
  getToken(): string | null {
    return getAccessToken()
  }

  /**
   * 解码 JWT payload（不验签名），检查 access token 是否已过期。
   * token 不存在或格式异常也视为过期。
   */
  isExpired(): boolean {
    const token = getAccessToken()
    if (!token) return true
    try {
      const payload = token.split('.')[1]
      const decoded = JSON.parse(atob(payload))
      const exp = decoded.exp as number
      if (!exp) return true
      // 提前 30 秒视为过期，防止边界情况
      return Date.now() >= exp * 1000 - 30000
    } catch {
      return true
    }
  }

  /** 是否已登录（基于内存状态） */
  isLoggedIn(): boolean {
    return isAuthenticated()
  }

  /** 尝试刷新 token */
  async tryRefresh(): Promise<boolean> {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return false

    try {
      const res = await fetch('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      })
      if (!res.ok) return false
      const data = await res.json()
      if (data?.token) {
        setTokens(data.token, data.refreshToken)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  /** 清除 token（不跳转），用于防循环等场景 */
  clear(): void {
    clearTokens()
  }

  /** 登出：清除 token + 跳转 splash */
  logout(): void {
    clearTokens()
    sessionStorage.removeItem('app_initialized')
    window.location.hash = '#/splash'
  }
}

export const tokenManager = new TokenManager()
