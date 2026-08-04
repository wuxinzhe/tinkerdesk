/** Agent 数据模型 */

/** AgentInfoVO — 列表接口（GET /agent/list）返回 */
export interface AgentListInfo {
  profile: string
  displayName: string
  avatar?: string
  isDefault?: boolean
  isActive?: boolean
}

/** AgentVO — 详情接口（GET /agent/{profile}）返回 */
export interface AgentInfo {
  profile: string
  displayName: string
  avatar?: string
  description?: string
  isDefault?: boolean
  isActive?: boolean
  agentModeId?: string
  agentModeVersion?: string
  createdAt?: string
  /** 对话场景主力模型名 */
  mainModelName?: string
}

export interface CreateAgentRequest {
  profile: string
  displayName: string
  avatar?: string
  description?: string
  agentModeId?: string
  agentModeVersion?: string
}

export interface UpdateAgentRequest {
  displayName?: string
  avatar?: string
  description?: string
  agentModeId?: string
  agentModeVersion?: string
  isActive?: boolean
}

/** ModeOptionDTO — GET /agent/mode/list?options=true 返回 */
export interface ModeOptionVO {
  id: string
  versions: string[]
}

/** ModeInfoVO — GET /agent/mode/list?options=false 返回 */
export interface ModeInfo {
  id: string
  version: string
  systemPrompt?: string
  maxIterations?: number
  thresholdPercent?: number
  tailRatio?: number
  status?: string
  createdAt?: string
  updatedAt?: string
}
