/**
 * core/mode/agent-mode.ts — Agent Mode SPI（类型归位 types.ts）
 *
 * IAgentMode (@AgentMode annotation + lifecycle hooks + prompt injection):
 * - implementation classes are stateless singletons (TS singleton or constructor-injected)
 * - metadata: id/version/name/description/promptTemplate
 * - getModuleList: dynamic prompt-module render order
 * - getDefaultConfig: config fallback when agent_configs has no row (hardcoded)
 *
 * 类型定义统一归位 ./types.ts，本文件仅 re-export 保持旧导入兼容。
 */
export type { AgentModeMeta, IAgentMode, ModeInfoDTO, ModeOptionDTO } from './types'
