/**
 * bootstrap.ts — 依赖组装入口（三层结构接线）
 *
 * repository (db/) → service (service/) → TinkerAgent (loop/)
 * + prompt (prompt/) + llm (llm/) + tools (tools/) + compaction (service/)
 *
 * No local business controllers: the renderer calls the agent loop via IPC
 * (agent-controller.ts).
 *
 * 「Agent 运行时装配」整段已提取到 core/agent/assemble-agent-loop.ts（单一来源——
 * 主进程与未来的 AgentWorker 进程共用同一套装配）。此处仅做 DB 初始化并调用之，
 * 用返回的 AgentLoopAssembly 组装 desk。
 */
import { app } from 'electron'
import { initDatabase } from './repository/database'
import { assembleAgentLoop, type AgentLoopAssembly } from './core/agent/assemble-agent-loop'
import type { AgentWorkerHost } from './core/agent/agent-worker-host'
import type { IDynamicPromptModule } from './core/prompt'
import type { AgentToolRegistration } from './builtins/tools'

export interface TinkerDesk extends AgentLoopAssembly {
  /** Agent 进程宿主（进程隔离——M2 起使用，主进程内联时可选） */
  agentWorkerHost?: AgentWorkerHost
}

/**
 * 应用启动时调用一次：初始化数据库 + 组装全部依赖。
 * 动态模块（IDynamicPromptModule[]）和工具（AgentToolRegistration[]）由调用方传入。
 */
export function bootstrap(
  promptModules: IDynamicPromptModule[],
  toolRegistrations: AgentToolRegistration[]
): TinkerDesk {
  // ── DB（主进程 DB bootstrap——Agent 运行时装配见 assembleAgentLoop）──
  initDatabase()

  return assembleAgentLoop({
    userDataPath: app.getPath('userData'),
    promptModules,
    toolRegistrations,
  })
}
