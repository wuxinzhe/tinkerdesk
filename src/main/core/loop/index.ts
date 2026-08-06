/**
 * loop/index.ts — AgentLoop 统一出口
 */
export {AgentLoop} from './agent-loop'
export {SCENE_CHAT} from '../llm/types'
export {CONV_IN_PROGRESS, CONV_COMPLETED, CONV_COMPRESSED, RES_INTERRUPTED} from './types'
export type {AgentLoopOptions, AgentLoopResult} from './types'
// 三级上下文（对齐 tinker-agent SessionContext → ConversationContext → ToolContext）
export {buildConvCtx as startCycle, buildToolCtx as createToolContext} from './context'
export type {SessionContext, ConversationContext, ToolContext, AgentConfig, ClientEnv} from './context'
