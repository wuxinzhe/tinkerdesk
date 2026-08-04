/** 模型管理 API 类型定义 */

/** 自定义模型测试结果 */
export interface CustomModelTestResult {
  success: boolean
  latencyMs?: number
  message?: string
}

/** 更新场景模型绑定请求 */
export interface UpdateSceneModelRequest {
  sceneId: string
  modelId: string | null
}

/** 绑定场景模型请求 */
export interface BindSceneModelRequest {
  sceneId: string
  modelId: string
  profile?: string
  priority?: number
}

/** 重排场景绑定请求 */
export interface ReorderSceneBindingsRequest {
  sceneId: string
  priorities: number[]
}

/** 自定义模型更新参数（不包含 modelType — 服务端 UpdateCustomModelRequestVO 无此字段） */
export interface UpdateCustomModelParams {
  alias?: string
  modelName?: string
  providerId?: string
  apiKey?: string
  baseUrl?: string
  contextLimit?: number
}
