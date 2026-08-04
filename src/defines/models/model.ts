/** 模型管理数据类型 */
export interface SystemProvider {
  id: string
  name: string
  apiMode: string
  baseUrl: string
  description?: string
  sortOrder?: number
  /** 服务端实体字段，前端仅兼容接收 */
  createdAt?: string
}

export interface ModelInfo {
  id: string
  object: string
  ownedBy: string
}

export interface CustomModelInfo {
  id: string
  alias: string
  providerId: string
  modelName: string
  baseUrl?: string
  contextLimit?: number
  modelType?: string
  enabled?: boolean
  testPassed?: boolean
  createdAt?: string
}

/** 创建自定义模型的请求参数（apiKey 仅用于发送，服务端不返回） */
export interface CreateCustomModelRequest {
  alias: string
  modelName: string
  providerId: string
  apiKey: string
  baseUrl?: string
  contextLimit?: number
  modelType?: string
}

export interface SceneModelDetail {
  sceneId: string
  sceneName: string
  bindings: SceneBindingVO[]
}

export interface SceneBindingVO {
  priority: number
  modelId: string
  modelAlias: string
  modelName: string
  /** 服务端 DTO 字段，前端列表中不使用但兼容接收 */
  sceneId?: string
}
