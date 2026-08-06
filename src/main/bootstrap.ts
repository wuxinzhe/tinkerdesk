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

import type { IDynamicPromptModule } from './core/prompt'
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
} from './core/prompt'

import type { ModelConfig } from './core/llm'
import { AnthropicClient, LlmClientManager, LlmOperationManager, LlmRouter, OpenAIClient } from './core/llm'

import type { AgentToolRegistration } from './tools'
import { getMcpToolCenter } from './core/tool'
import type { McpToolCenter } from './core/tool'
import {
  TerminalTool, TERMINAL_TOOL_NAME,
  ProcessTool, PROCESS_TOOL_NAME,
  ReadTerminalTool, READ_TERMINAL_TOOL_NAME,
  CloseTerminalTool, CLOSE_TERMINAL_TOOL_NAME,
  ReadFileTool, READ_FILE_TOOL_NAME,
  WriteFileTool, WRITE_FILE_TOOL_NAME,
  PatchTool, PATCH_TOOL_NAME,
  SearchFilesTool, SEARCH_FILES_TOOL_NAME,
  WebSearchTool, WEB_SEARCH_TOOL_NAME,
  WebExtractTool, WEB_EXTRACT_TOOL_NAME,
  ScheduleTimerTool, SCHEDULE_TIMER_TOOL_NAME,
  FileMutationVerifierTool, FILE_MUTATION_VERIFIER_TOOL_NAME,
} from './tools/desktop'
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
} from './tools'
import { ToolManager } from './core/tool'
import {TodoService} from './service/todo-service'
import {PrivateSkillService} from './service/private-skill-service'
import {UserCustomModelService} from './service/user-custom-model-service'
import {SceneModelService} from './service/scene-model-service'
import {AgentService} from './service/agent-service'
import {AgentConfigService} from './service/agent-config-service'
import {SystemProviderService} from './service/system-provider-service'
import {SkillCategoryService} from './service/skill-category-service'
import {PromptService} from './service/prompt-service'
import { ModelConfigService } from './service/model-config-service'
import { TitleOperation } from './core/llm/operations/title-operation'
import { ChatOperation } from './core/llm/operations/chat-operation'
import { SummaryOperation } from './core/llm/operations/summary-operation'
import { SessionContextFactory } from './service/session-context-factory'
import { AgentModeService } from './service/agent-mode-service'
import { AccountService } from './service/account-service'
import { DefaultAgentMode } from './service/agent/default-agent-mode'
import { AgentModeRegistry } from './core/mode/agent-mode-registry'
import { SandboxWhitelistService } from './service/sandbox-whitelist-service'
import { ToolAuthService } from './service/tool-auth-service'
import {PrivateSkillRepository} from './repository/private-skill-repository'
import {PrivateSkillFileRepository} from './repository/private-skill-file-repository'
import {PrivateSkillRelatedRepository} from './repository/private-skill-related-repository'
import {AgentRepository} from './repository/agent-repository'
import {AgentConfigRepository} from './repository/agent-config-repository'
import {SkillCategoryRepository} from './repository/skill-category-repository'
import {PromptModuleRepository} from './repository/prompt-module-repository'
import {UserUrlWhitelistRepository} from './repository/user-url-whitelist-repository'
import {UserPathWhitelistRepository} from './repository/user-path-whitelist-repository'
import {SystemProviderRepository} from './repository/system-provider-repository'
import {UserSceneModelRepository} from './repository/user-scene-model-repository'

import { AgentLoop } from './core/loop/agent-loop'

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
  // ── controller 层依赖 ──
  privateSkillService: PrivateSkillService
  skillCategoryService: SkillCategoryService
  promptService: PromptService
  sandboxWhitelistService: SandboxWhitelistService
  agentRepo: AgentRepository
  agentConfigRepo: AgentConfigRepository
  providerRepo: SystemProviderRepository
  sceneRepo: UserSceneModelRepository
  customModelService: UserCustomModelService
  sceneModelService: SceneModelService
  agentService: AgentService
  agentConfigService: AgentConfigService
  systemProviderService: SystemProviderService
  accountService: AccountService
  sessionContextFactory: SessionContextFactory
  agentModeRegistry: AgentModeRegistry
  agentModeService: AgentModeService
  mcpToolCenter: McpToolCenter
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
  const renderer = new PromptRenderer()
  const operationManager = new LlmOperationManager([
    new ChatOperation(),
    new SummaryOperation(),
    new TitleOperation(renderer),
  ])
  const llmRouter = new LlmRouter(clientManager, operationManager)

  // ── Service 层 ──
  const messageService = new MessageService(messageRepo, conversationRepo)
  const conversationService = new ConversationService(conversationRepo)
  const sessionService = new SessionService(sessionRepo, messageRepo)
  const cooldownStore = new CompressionCooldownStore()
  const todoService = new TodoService(app.getPath('userData'))
  const compactionService = new CompactionService(llmRouter, messageService, conversationService, cooldownStore, todoService)

  // ── Prompt（预设模块 + 调用方自定义模块） ──

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
    new SoulPromptModule(renderer),
  ]

  // 数据源（条件模块依赖；需在模块注册前创建）
  const memoryStore = new MemoryStore(app.getPath('userData'))
  const privateSkillService = new PrivateSkillService(new PrivateSkillRepository(), new PrivateSkillFileRepository(), new PrivateSkillRelatedRepository())

  // 条件模块（依赖技能/记忆数据源）
  const allModules: IDynamicPromptModule[] = [
    ...presetModules,
    ...promptModules,
    new UserProfileModule(renderer, memoryStore),
    new SkillsIndexModule(renderer, (profile) => privateSkillService.findFiltered(profile)),
    new MemorySnapshotModule(renderer, (profile) => memoryStore.readAll(MemoryStore.TARGET_MEMORY, profile)),
  ]
  const promptManager = new PromptManager(allModules)
  const staticModuleRepo = {
    findByProfile: (_profile: string) => [] as Array<{ id: string; content: string; enabled: boolean; sortOrder: number }>,
  }
  const promptModuleBuilder = new PromptModuleBuilder(promptManager, sessionRepo, staticModuleRepo)

  // ── Tools（内建工具 + 调用方自定义工具） ──
  const builtinTools: AgentToolRegistration[] = [
    {meta: {name: MEMORY_TOOL_NAME, emoji: '🧠'}, tool: new MemoryTool(renderer, memoryStore)},
    {meta: {name: TODO_TOOL_NAME, emoji: '✅'}, tool: new TodoTool(renderer, todoService)},
    {meta: {name: CLARIFY_TOOL_NAME, emoji: '❓'}, tool: new ClarifyTool(renderer, messageService)},
    {meta: {name: SKILL_VIEW_TOOL_NAME, emoji: '📄'}, tool: new SkillViewTool(renderer, privateSkillService)},
    {meta: {name: SKILLS_LIST_TOOL_NAME, emoji: '📚'}, tool: new SkillsListTool(renderer, privateSkillService)},
    {meta: {name: SKILL_MANAGE_TOOL_NAME, emoji: '🛠️'}, tool: new SkillManageTool(renderer, privateSkillService, new PrivateSkillFileRepository())},
    {meta: {name: SESSION_SEARCH_TOOL_NAME, emoji: '🔍'}, tool: new SessionSearchTool(renderer, sessionService)},
  ]
  // ── Desktop 工具（客户端工具，与内建隔离在 tools/desktop/） ──
  const desktopTools: AgentToolRegistration[] = [
    {meta: {name: TERMINAL_TOOL_NAME, emoji: '💻'}, tool: new TerminalTool(renderer)},
    {meta: {name: PROCESS_TOOL_NAME, emoji: '⚙️'}, tool: new ProcessTool(renderer)},
    {meta: {name: READ_TERMINAL_TOOL_NAME, emoji: '📋'}, tool: new ReadTerminalTool(renderer)},
    {meta: {name: CLOSE_TERMINAL_TOOL_NAME, emoji: '🔌'}, tool: new CloseTerminalTool(renderer)},
    {meta: {name: READ_FILE_TOOL_NAME, emoji: '📄'}, tool: new ReadFileTool(renderer)},
    {meta: {name: WRITE_FILE_TOOL_NAME, emoji: '📝'}, tool: new WriteFileTool(renderer)},
    {meta: {name: PATCH_TOOL_NAME, emoji: '✂️'}, tool: new PatchTool(renderer)},
    {meta: {name: SEARCH_FILES_TOOL_NAME, emoji: '🔍'}, tool: new SearchFilesTool(renderer)},
    {meta: {name: WEB_SEARCH_TOOL_NAME, emoji: '🌐'}, tool: new WebSearchTool(renderer)},
    {meta: {name: WEB_EXTRACT_TOOL_NAME, emoji: '📰'}, tool: new WebExtractTool(renderer)},
    {meta: {name: SCHEDULE_TIMER_TOOL_NAME, emoji: '⏰'}, tool: new ScheduleTimerTool(renderer)},
    {meta: {name: FILE_MUTATION_VERIFIER_TOOL_NAME, emoji: '🔬'}, tool: new FileMutationVerifierTool(renderer)},
  ]

  const toolManager = new ToolManager([...builtinTools, ...desktopTools, ...toolRegistrations])
  // MCP 工具同构注册：McpToolCenter 连接后生成 McpTool 实例 → 动态注册进统一注册中心
  // （toolType=mcp，ToolManager.execute 按类型路由到 MCP 统一执行器）
  const mcpCenter = getMcpToolCenter()
  mcpCenter.attachToolManager(toolManager)
  // 启动恢复：从库加载已注册 MCP 工具 → check 可用性 → 注册（无需重新 discover）
  void mcpCenter.restoreFromDb()

  // ── 模型配置解析服务（custom_models + providers → ModelConfig[]） ──
  const modelConfigService = new ModelConfigService(CustomModelRepository, ProviderRepository)

  // ── 安全门检服务（AgentLoop 工具门检用，需在 AgentLoop 之前组装） ──
  const sandboxWhitelistService = new SandboxWhitelistService(new UserUrlWhitelistRepository(), new UserPathWhitelistRepository())
  const toolAuthService = new ToolAuthService()

  // ── AgentLoop ──
  const agentLoop = new AgentLoop({
    llmRouter,
    toolManager,
    messageService,
    sessionService,
    conversationService,
    compactionService,
    promptModuleBuilder,
    modelConfigService,
    sandboxWhitelistService,
    toolAuthService,
  })

  // ── Controller 层依赖 ──
  const agentRepo = new AgentRepository()
  const agentConfigRepo = new AgentConfigRepository()
  const providerRepo = new SystemProviderRepository()
  const sceneRepo = new UserSceneModelRepository()
  const skillCategoryService = new SkillCategoryService(new SkillCategoryRepository())
  const promptService = new PromptService(new PromptModuleRepository())
  const customModelService = new UserCustomModelService(CustomModelRepository, providerRepo)
  const sceneModelService = new SceneModelService(sceneRepo, operationManager)
  // ── Agent Mode：注册表 + 默认模式（对齐 Java 注解扫描 → 手动注册），agentService 创建时需要 ---
  const agentModeRegistry = new AgentModeRegistry()
  agentModeRegistry.register(new DefaultAgentMode(renderer))
  const agentService = new AgentService(agentRepo, agentConfigRepo, agentModeRegistry)
  const agentConfigService = new AgentConfigService(agentConfigRepo, agentService, agentModeRegistry)
  const systemProviderService = new SystemProviderService(providerRepo)
  const agentModeService = new AgentModeService(agentModeRegistry, agentService)
  const accountService = new AccountService(agentService, agentConfigService, customModelService, sceneModelService)
  const sessionContextFactory = new SessionContextFactory(agentConfigService, sessionService, agentModeRegistry, agentService)

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
    privateSkillService,
    skillCategoryService,
    promptService,
    sandboxWhitelistService,
    agentRepo,
    agentConfigRepo,
    providerRepo,
    sceneRepo,
    customModelService,
    sceneModelService,
    agentService,
    agentConfigService,
    systemProviderService,
    accountService,
    sessionContextFactory,
    agentModeRegistry,
    agentModeService,
    mcpToolCenter: mcpCenter,
  }
}
