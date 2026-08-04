/** 技能接口 */
export interface SkillInfo {
  id: string
  name: string
  displayName: string
  description?: string
  category?: string
  version?: string
  author?: string
  license?: string
  platforms?: string[]
  envs?: string[]
  tags?: string[]
  dependencies?: string[]
  requiresToolsets?: string[]
  requiresTools?: string[]
  triggers?: string[]
  triggerConditions?: string
  config?: string
  body?: string
  isEnabled?: boolean
  isInstalled?: boolean
  updatedAt?: string
}

export interface SkillCategory {
  id: string
  name: string
  displayName: string
  description?: string
  icon?: string
  sortOrder?: number
  isActive?: boolean
}
