/** 通用 API 响应类型 */

export interface ApiResponse<T = unknown> {
  code?: number
  message?: string
  data?: T
  error?: string
  success?: boolean
}

export interface PageResponse<T> {
  items: T[]
  total: number
  offset: number
  limit: number
}

export class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly response?: ApiResponse
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
