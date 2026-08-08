/**
 * loop/index.ts — TinkerAgent 统一出口
 */
export {TinkerAgent} from './tinker-agent'
export {SCENE_CHAT} from '../llm/types'
export {CONV_IN_PROGRESS, CONV_COMPLETED, CONV_COMPRESSED, RES_INTERRUPTED} from './types'
export type {TinkerAgentOptions, TinkerAgentResult} from './types'
// 三级上下文
export {buildConvCtx as startCycle, buildToolCtx as createToolContext} from './context'
export type {SessionContext, ConversationContext, ToolContext, AgentConfig, ClientEnv} from './context'
