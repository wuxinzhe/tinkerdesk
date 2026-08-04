/**
 * agent-config.ts — Agent 配置数据类型定义
 */
export interface AgentConfigData {
  maxIterations: number
  toolExecutionTimeout: number
  maxConversations: number
  memoryMaxChars: number
  userMaxChars: number
  thresholdPercent: number
  tailRatio: number
  agentSoulPrompt: string | null
  warningsEnabled: boolean
  hardStopEnabled: boolean
  exactFailureWarnAfter: number
  sameToolFailureWarnAfter: number
  noProgressWarnAfter: number
  exactFailureBlockAfter: number
  sameToolFailureHaltAfter: number
  noProgressBlockAfter: number
}
