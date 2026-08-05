/**
 * bootstrap.ts — 依赖组装入口（三层结构接线）
 *
 * repository（db/）→ service（service/）→ AgentLoop（loop/）
 * + prompt（prompt/）+ llm（llm/）+ tools（tools/）+ compaction（service/）
 *
 * 本地业务无 controller：渲染进程通过 IPC（agent-controller.ts）调用 agentLoop。
 */
import {app} from 'electron'
import { ConversationRepository } from './repository/conversation-repository'
import { CustomModelRepository } from './repository/custom-model-repository'
import { initDatabase } from './repository/database'
import { MessageRepository } from './repository/message-repository'
import { ProviderRepository } from './repository/providers-repository'
import { SessionRepository } from './repository/session-repository'

import { CompactionService } from './service/compaction-service'
import { CompressionCooldownStore } from './service/compression-cooldown-store'
import { ConversationService } from './service/conversation-service'
import { MemoryStore } from './service/memory-store'
import { MessageService } from './service/message-service'
import { SessionService } from './service/session-service'

import type { IDynamicPromptModule } from './prompt'
import {
  AgentModePromptModule,
  GoogleOperationalModule,
  MemoryGuidanceModule,
  MemorySnapshotModule,
  OpenAIExecutionModule,
  PromptManager,
  PromptModuleBuilder,
  PromptRenderer,
  RuntimeEnvironmentModule,
  SessionSearchModule,
  SkillsIndexModule,
  SoulPromptModule,
  SystemContextModule,
  TaskCompletionModule,
  ToolEnforcementModule,
  UserProfileModule,
} from './prompt'

import type { ModelConfig } from './llm'
import { AnthropicClient, apiModeFromString, createModelConfig, LlmClientManager, LlmOperationManager, LlmRouter, OpenAIClient } from './llm'

import type { AgentToolRegistration } from './tools'
import {
  ClarifyTool,
  CLARIFY_TOOL_NAME,
  MemoryTool,
  MEMORY_TOOL_NAME,
  SessionSearchTool,
  SESSION_SEARCH_TOOL_NAME,
  SkillManageTool,
  SKILL_MANAGE_TOOL_NAME,
  SkillsListTool,
  SKILLS_LIST_TOOL_NAME,
  SkillViewTool,
  SKILL_VIEW_TOOL_NAME,
  TodoTool,
  TODO_TOOL_NAME,
  ToolManager,
} from './tools'
import {TodoService} from './service/todo-service'
import {PrivateSkillService} from './service/private-skill-service'
import {PrivateSkillRepository} from './repository/private-skill-repository'
import {PrivateSkillFileRepository} from './repository/private-skill-file-repository'
import {PrivateSkillRelatedRepository} from './repository/private-skill-related-repository'

import { AgentLoop } from './loop/agent-loop'

/** 组装结果 */
export interface TinkerDesk {
  agentLoop: AgentLoop
  messageService: MessageService
  conversationService: ConversationService
  sessionService: SessionService
  compactionService: CompactionService
  memoryStore: MemoryStore
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
  const sessionService = new SessionService(sessionRepo, messageRepo)
  const cooldownStore = new CompressionCooldownStore()
  const compactionService = new CompactionService(llmRouter, messageService, conversationService, cooldownStore)

  // ── Prompt（预设模块 + 调用方自定义模块） ──
  const renderer = new PromptRenderer()

  // 预设模块：注入技能查询/记忆读取依赖（对接 PrivateSkillService / MemoryStore）
  const presetModules: IDynamicPromptModule[] = [
    new AgentModePromptModule(renderer),
    new SystemContextModule(renderer),
    new RuntimeEnvironmentModule(renderer),
    new ToolEnforcementModule(renderer),
    new TaskCompletionModule(renderer),
    new OpenAIExecutionModule(renderer),
    new GoogleOperationalModule(renderer),
    new MemoryGuidanceModule(renderer),
    new SessionSearchModule(renderer),
    new UserProfileModule(renderer),
    new SoulPromptModule(renderer),
  ]

  // 条件模块（依赖技能/记忆数据源；未注入时提供空实现）
  const memoryStore = new MemoryStore(app.getPath('userData'))
  const allModules: IDynamicPromptModule[] = [
    ...presetModules,
    ...promptModules,
    new SkillsIndexModule(renderer, () => []),
    new MemorySnapshotModule(renderer, (profile) => memoryStore.readAll(MemoryStore.TARGET_MEMORY, profile)),
  ]
  const promptManager = new PromptManager(allModules)
  const staticModuleRepo = {
    findByProfile: (_profile: string) => [] as Array<{ id: string; content: string; enabled: boolean; sortOrder: number }>,
  }
  const promptModuleBuilder = new PromptModuleBuilder(promptManager, sessionRepo, staticModuleRepo)

  // ── Tools（内建工具 + 调用方自定义工具） ──
  const todoService = new TodoService(app.getPath('userData'))
  const privateSkillService = new PrivateSkillService(new PrivateSkillRepository(), new PrivateSkillFileRepository(), new PrivateSkillRelatedRepository())
  const builtinTools: AgentToolRegistration[] = [
    {meta: {name: MEMORY_TOOL_NAME, emoji: '🧠'}, tool: new MemoryTool(renderer, memoryStore)},
    {meta: {name: TODO_TOOL_NAME, emoji: '✅'}, tool: new TodoTool(renderer, todoService)},
    {meta: {name: CLARIFY_TOOL_NAME, emoji: '❓'}, tool: new ClarifyTool(renderer, messageService)},
    {meta: {name: SKILL_VIEW_TOOL_NAME, emoji: '📄'}, tool: new SkillViewTool(renderer, privateSkillService)},
    {meta: {name: SKILLS_LIST_TOOL_NAME, emoji: '📚'}, tool: new SkillsListTool(renderer, privateSkillService)},
    {meta: {name: SKILL_MANAGE_TOOL_NAME, emoji: '🛠️'}, tool: new SkillManageTool(renderer, privateSkillService, new PrivateSkillFileRepository())},
    {meta: {name: SESSION_SEARCH_TOOL_NAME, emoji: '🔍'}, tool: new SessionSearchTool(renderer, sessionService)},
  ]
  const toolManager = new ToolManager([...builtinTools, ...toolRegistrations])

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
    memoryStore,
    promptManager,
    promptModuleBuilder,
    toolManager,
    llmRouter,
  }
}
