/**
 * api-response.ts — 统一 API 响应包装
 *
 * 复刻 tinker-agent ApiResponse：
 * 成功：{ success: true,  data: {...}, error: null }
 * 失败：{ success: false, data: null,  error: "message" }
 * 所有 IPC controller 返回此结构，前端根据 success 判断。
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data: T | null
  error: string | null
}

/** 创建成功响应（含数据） */
export function ok<T>(data: T): ApiResponse<T> {
  return {success: true, data, error: null}
}

/** 创建成功响应（无数据） */
export function okEmpty(): ApiResponse<null> {
  return {success: true, data: null, error: null}
}

/** 创建失败响应（泛型：调用处标注期望的 T，如 ApiResponse<CustomModelInfoDTO>） */
export function fail<T = null>(error: string): ApiResponse<T> {
  return {success: false, data: null, error}
}
