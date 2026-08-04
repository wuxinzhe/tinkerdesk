/**
 * bootstrap.ts — 依赖组装入口（三层结构接线）
 *
 * repository（db/）→ service（service/）→ AgentLoop（loop/）
 * + prompt（prompt/）+ llm（llm/）+ tools（tools/）+ compaction（service/）
 *
 * 本地业务无 controller：渲染进程通过 IPC（agent-controller.ts）调用 agentLoop。
 */
import { ConversationRepository } from './db/conversation-repository'
import { CustomModelRepository } from './db/custom-model-repository'
import { initDatabase } from './db/database'
import { MessageRepository } from './db/message-repository'
import { ProviderRepository } from './db/providers-repository'
import { SessionRepository } from './db/session-repository'

import { CompactionService } from './service/compaction-service'
import { CompressionCooldownStore } from './service/compression-cooldown-store'
import { ConversationService } from './service/conversation-service'
import { MessageService } from './service/message-service'
import { SessionService } from './service/session-service'

import type { IDynamicPromptModule } from './prompt'
import { PromptManager, PromptModuleBuilder } from './prompt'

import type { ModelConfig } from './llm'
import { AnthropicClient, apiModeFromString, createModelConfig, LlmClientManager, LlmOperationManager, LlmRouter, OpenAIClient } from './llm'

import type { AgentToolRegistration } from './tools'
import { ToolManager } from './tools'

import { AgentLoop } from './loop/agent-loop'

/** 组装结果 */
export interface TinkerDesk {
  agentLoop: AgentLoop
  messageService: MessageService
  conversationService: ConversationService
  sessionService: SessionService
  compactionService: CompactionService
  promptManager: PromptManager
  promptModuleBuilder: PromptModuleBuilder
  toolManager: ToolManager
  llmRouter: LlmRouter
}

/**
 * 应用启动时调用一次：初始化数据库 + 组装全部依赖。
 * 动态模块（IDynamicPromptModule[]）和工具（AgentToolRegistration[]）由调用方传入。
 */
export function bootstrap(
  promptModules: IDynamicPromptModule[],
  toolRegistrations: AgentToolRegistration[]
): TinkerDesk {
  // ── DB ──
  initDatabase()
  const messageRepo = new MessageRepository()
  const conversationRepo = new ConversationRepository()
  const sessionRepo = new SessionRepository()

  // ── LLM（先建，CompactionService 需要）──
  const clientManager = new LlmClientManager([new OpenAIClient(), new AnthropicClient()])
  const operationManager = new LlmOperationManager([])
  const llmRouter = new LlmRouter(clientManager, operationManager)

  // ── Service 层 ──
  const messageService = new MessageService(messageRepo, conversationRepo)
  const conversationService = new ConversationService(conversationRepo)
  const sessionService = new SessionService(sessionRepo)
  const cooldownStore = new CompressionCooldownStore()
  const compactionService = new CompactionService(llmRouter, messageService, conversationService, cooldownStore)

  // ── Prompt ──
  const promptManager = new PromptManager(promptModules)
  const staticModuleRepo = {
    findByProfile: (_profile: string) => [] as Array<{ id: string; content: string; enabled: boolean; sortOrder: number }>,
  }
  const promptModuleBuilder = new PromptModuleBuilder(promptManager, sessionRepo, staticModuleRepo)

  // ── Tools ──
  const toolManager = new ToolManager(toolRegistrations)

  // ── 模型配置解析（custom_models + providers → ModelConfig[]） ──
  const resolveModelConfigs = (scene: string): ModelConfig[] => {
    const models = CustomModelRepository.listEnabled('default')
    return models.map((m) => {
      const provider = ProviderRepository.findById(m.providerId)
      const apiMode = provider ? apiModeFromString(provider.apiMode) : 'openai'
      return createModelConfig(
        m.modelName,
        m.apiKey,
        m.baseUrl || provider?.baseUrl || '',
        m.contextLimit,
        apiMode
      )
    })
  }

  // ── AgentLoop ──
  const agentLoop = new AgentLoop({
    llmRouter,
    toolManager,
    messageService,
    sessionService,
    conversationService,
    compactionService,
    promptModuleBuilder,
    resolveModelConfigs,
  })

  return {
    agentLoop,
    messageService,
    conversationService,
    sessionService,
    compactionService,
    promptManager,
    promptModuleBuilder,
    toolManager,
    llmRouter,
  }
}
