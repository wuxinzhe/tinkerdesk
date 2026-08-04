/** 沙盒白名单 API 类型定义 */

export interface UrlWhitelistItem {
  id: number
  urlPattern: string
  description?: string
  userId?: string
  profile?: string
  enabled?: boolean
  createdAt?: string
}

export interface PathWhitelistItem {
  id: number
  pathPattern: string
  description?: string
  userId?: string
  profile?: string
  enabled?: boolean
  createdAt?: string
}
