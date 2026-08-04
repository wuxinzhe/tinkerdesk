/** 会话数据模型 */
export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  profile: string
  /** 服务端列表接口永远返回 'idle'，处理中状态由 isProcessingBySession 追踪 */
  status: 'idle'
}
