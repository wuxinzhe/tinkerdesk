/**
 * loop/index.ts — AgentLoop 统一出口
 */
export {AgentLoop} from './agent-loop'
export {SCENE_CHAT, CONV_IN_PROGRESS, CONV_COMPLETED, CONV_COMPRESSED, RES_INTERRUPTED} from './types'
export type {AgentLoopOptions, AgentLoopResult} from './types'
// 三级上下文（对齐 showing-agent SessionContext → ConversationContext → ToolContext）
export {startCycle, createToolContext, defaultAgentConfig} from './context'
export type {SessionContext, ConversationContext, ToolContext, AgentConfig, ClientEnv} from './context'
