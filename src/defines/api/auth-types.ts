/** 发送邮箱验证码响应 */
export interface EmailCodeResponse {
  sent: boolean
  debug_code?: string
}

/** 认证 API 类型定义 */

export interface TokenResponse {
  token: string
  refreshToken: string
  initialized: boolean
}

export interface InitStatusResponse {
  initialized: boolean
  checks?: InitCheckItem[]
}

export interface InitCheckItem {
  name: string
  label: string
  passed: boolean
  detail?: string
}
