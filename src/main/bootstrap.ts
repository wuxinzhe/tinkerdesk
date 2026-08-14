/**
 * bootstrap.ts — 依赖组装入口（三层结构接线）
 *
 * repository（db/）→ service（service/）→ TinkerAgent（loop/）
 * + prompt（prompt/）+ llm（llm/）+ tools（tools/）+ compaction（service/）
 *
 * 本地业务无 controller：渲染进程通过 IPC（agent-controller.ts）调用 agentLoop。
 */
import { app } from 'electron'
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

import { AnthropicClient, GoogleClient, LlmClientManager, LlmOperationManager, LlmRouter, OpenAIClient } from './core/llm'

import { ChatOperation } from './core/llm/operations/chat-operation'
import { SummaryOperation } from './core/llm/operations/summary-operation'
import { TitleOperation } from './core/llm/operations/title-operation'
import { VisionOperation } from './core/llm/operations/vision-operation'
import { AgentModeRegistry } from './core/mode/agent-mode-registry'
import { PluginManager } from './core/plugin/plugin-manager'
import type { McpToolCenter } from './core/tool'
import { getMcpToolCenter, ToolManager } from './core/tool'
import { AgentConfigRepository } from './repository/agent-config-repository'
import { AgentRepository } from './repository/agent-repository'
import { PrivateSkillFileRepository } from './repository/private-skill-file-repository'
import { PrivateSkillRelatedRepository } from './repository/private-skill-related-repository'
import { PrivateSkillRepository } from './repository/private-skill-repository'
import { PromptModuleRepository } from './repository/prompt-module-repository'
import { SkillCategoryRepository } from './repository/skill-category-repository'
import { SystemProviderRepository } from './repository/system-provider-repository'
import { UserPathWhitelistRepository } from './repository/user-path-whitelist-repository'
import { UserSceneModelRepository } from './repository/user-scene-model-repository'
import { UserUrlWhitelistRepository } from './repository/user-url-whitelist-repository'
import { AccountService } from './service/account-service'
import { AgentConfigService } from './service/agent-config-service'
import { WebProvider } from './service/web-provider'
import { AudioToolProvider } from './service/audio-tool-provider'
import { EDGE_TTS_MANIFEST, edgeTtsPlugin } from './providers/tts/edge'
import { CUA_DRIVER_MANIFEST, cuaDriverPlugin } from './providers/computer-use/cua-driver'
import { ComputerUseProvider } from './service/computer-use-provider'
import { UserDisabledToolService } from './service/user-disabled-tool-service'
import { UserDisabledToolRepository } from './repository/user-disabled-tool-repository'
import { AgentModeService } from './service/agent-mode-service'
import { AgentService } from './service/agent-service'
import { DefaultAgentMode } from './service/agent/default-agent-mode'
import { ModelConfigService } from './service/model-config-service'
import { PrivateSkillService } from './service/private-skill-service'
import { PromptService } from './service/prompt-service'
import { SandboxWhitelistService } from './service/sandbox-whitelist-service'
import { SceneModelService } from './service/scene-model-service'
import { SessionContextFactory } from './service/session-context-factory'
import { SkillCategoryService } from './service/skill-category-service'
import { SystemProviderService } from './service/system-provider-service'
import { TodoService } from './service/todo-service'
import { ToolAuthService } from './service/tool-auth-service'
import { UserCustomModelService } from './service/user-custom-model-service'
import type { AgentToolRegistration } from './tools'
import {
  CLARIFY_TOOL_NAME,
  ClarifyTool,
  MEMORY_TOOL_NAME,
  MemoryTool,
  SESSION_SEARCH_TOOL_NAME,
  SessionSearchTool,
  SKILL_MANAGE_TOOL_NAME,
  SKILL_VIEW_TOOL_NAME,
  SkillManageTool,
  SKILLS_LIST_TOOL_NAME,
  SkillsListTool,
  SkillViewTool,
  TODO_TOOL_NAME,
  TodoTool,
} from './tools'
import {
  CLOSE_TERMINAL_TOOL_NAME,
  CloseTerminalTool,
  FILE_MUTATION_VERIFIER_TOOL_NAME,
  FileMutationVerifierTool,
  PATCH_TOOL_NAME,
  PatchTool,
  PROCESS_TOOL_NAME,
  ProcessTool,
  READ_FILE_TOOL_NAME,
  READ_TERMINAL_TOOL_NAME,
  ReadFileTool,
  ReadTerminalTool,
  SCHEDULE_TIMER_TOOL_NAME,
  ScheduleTimerTool,
  SEARCH_FILES_TOOL_NAME,
  SearchFilesTool,
  TERMINAL_TOOL_NAME,
  TerminalTool,
  WEB_EXTRACT_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WebExtractTool,
  WebSearchTool,
  TextToSpeechTool,
  TEXT_TO_SPEECH_TOOL_NAME,
  SpeechToTextTool,
  SPEECH_TO_TEXT_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  WriteFileTool,
} from './tools/desktop'
import {
  PLUGIN_CONFIGURE_TOOL_NAME,
  PLUGIN_ENABLE_TOOL_NAME,
  PLUGIN_INSTALL_TOOL_NAME,
  PLUGIN_LIST_TOOL_NAME,
  PLUGIN_UNINSTALL_TOOL_NAME,
  PluginConfigureTool,
  PluginEnableTool,
  PluginInstallTool,
  PluginListTool,
  PluginUninstallTool,
} from './tools/plugin-tools'

import type { TinkerAgentOptions } from './core/loop/types'
import { TOOL_TYPE_DESKTOP } from './core/tool/types'
import { DelegateTool } from './tools/delegate-tool'
import { ComputerUseTool, TOOL_NAME as COMPUTER_USE_TOOL_NAME } from './tools/computer-use/computer-use-tool'
import { VisionRecognizeTool, TOOL_NAME as VISION_RECOGNIZE_TOOL_NAME } from './tools/desktop/vision-tool'
import { VisionProvider } from './service/vision-provider'

/** 组装结果 */
export interface TinkerDesk {
  /** TinkerAgent 装配选项（OO 化——controller 按 session 惰性实例化） */
  agentLoopOptions: Omit<TinkerAgentOptions, 'sessionId' | 'profile'>
  messageService: MessageService
  conversationService: ConversationService
  sessionService: SessionService
  compactionService: CompactionService
  memoryStore: MemoryStore
  promptManager: PromptManager
  promptModuleBuilder: PromptModuleBuilder
  toolManager: ToolManager
  pluginManager: PluginManager
  llmRouter: LlmRouter
  modelConfigService: ModelConfigService
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
  webProviderService: WebProvider
  audioToolProvider: AudioToolProvider
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
  const clientManager = new LlmClientManager([new OpenAIClient(), new AnthropicClient(), new GoogleClient()])
  const renderer = new PromptRenderer()
  const operationManager = new LlmOperationManager([
    new ChatOperation(),
    new SummaryOperation(),
    new TitleOperation(renderer),
    new VisionOperation(),
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
    { meta: { name: MEMORY_TOOL_NAME, emoji: '🧠' }, tool: new MemoryTool(renderer, memoryStore) },
    { meta: { name: TODO_TOOL_NAME, emoji: '✅' }, tool: new TodoTool(renderer, todoService) },
    { meta: { name: CLARIFY_TOOL_NAME, emoji: '❓' }, tool: new ClarifyTool(renderer, messageService) },
    { meta: { name: SKILL_VIEW_TOOL_NAME, emoji: '📄' }, tool: new SkillViewTool(renderer, privateSkillService) },
    { meta: { name: SKILLS_LIST_TOOL_NAME, emoji: '📚' }, tool: new SkillsListTool(renderer, privateSkillService) },
    { meta: { name: SKILL_MANAGE_TOOL_NAME, emoji: '🛠️' }, tool: new SkillManageTool(renderer, privateSkillService, new PrivateSkillFileRepository()) },
    { meta: { name: SESSION_SEARCH_TOOL_NAME, emoji: '🔍' }, tool: new SessionSearchTool(renderer, sessionService) },
  ]
  // 子代理工具（OO 化 delegate——依赖延迟解析：agentLoopOptions/sessionContextFactory 在装配后部定义）
  builtinTools.push({
    meta: { name: 'builtin_tinker_delegate', emoji: '🤖' },
    tool: new DelegateTool(renderer, () => ({
      agentLoopOptions,
      sessionContextFactory,
      sessionService,
    })),
  })
  // 桌面控制工具（cua-driver——后台桌面自动化；check() 在 cua-driver 未安装时自动不入池）→ desktop 组（与 terminal 一致）
  // 注册在 desktopTools（见下方）——工具名 desktop_tinker_computer_use
  // ── Desktop 工具（客户端工具，与内建隔离在 tools/desktop/） ──
  // ── 插件管理（提前创建：desktopTools 的 web/audio 工具需要 provider 服务） ──
  const pluginManager = new PluginManager()
  // 内置插件（代码注册——出现在插件列表、可配置，不可卸载）
  pluginManager.registerBuiltinPlugin({ manifest: EDGE_TTS_MANIFEST, plugin: edgeTtsPlugin })
  pluginManager.registerBuiltinPlugin({ manifest: CUA_DRIVER_MANIFEST, plugin: cuaDriverPlugin })
  const webProvider = new WebProvider(pluginManager)
  const audioToolProvider = new AudioToolProvider(pluginManager)
  const computerUseProvider = new ComputerUseProvider(pluginManager)
  // 模型配置解析服务（custom_models + providers → ModelConfig[]）——vision provider 依赖（场景模型解析）
  const modelConfigService = new ModelConfigService(CustomModelRepository, ProviderRepository, new UserSceneModelRepository())
  const visionProvider = new VisionProvider(llmRouter, modelConfigService)

  const desktopTools: AgentToolRegistration[] = [
    { meta: { name: TERMINAL_TOOL_NAME, emoji: '💻', toolType: TOOL_TYPE_DESKTOP }, tool: new TerminalTool(renderer) },
    { meta: { name: PROCESS_TOOL_NAME, emoji: '⚙️', toolType: TOOL_TYPE_DESKTOP }, tool: new ProcessTool(renderer) },
    { meta: { name: READ_TERMINAL_TOOL_NAME, emoji: '📋', toolType: TOOL_TYPE_DESKTOP }, tool: new ReadTerminalTool(renderer) },
    { meta: { name: CLOSE_TERMINAL_TOOL_NAME, emoji: '🔌', toolType: TOOL_TYPE_DESKTOP }, tool: new CloseTerminalTool(renderer) },
    { meta: { name: READ_FILE_TOOL_NAME, emoji: '📄', toolType: TOOL_TYPE_DESKTOP }, tool: new ReadFileTool(renderer) },
    { meta: { name: WRITE_FILE_TOOL_NAME, emoji: '📝', toolType: TOOL_TYPE_DESKTOP }, tool: new WriteFileTool(renderer) },
    { meta: { name: PATCH_TOOL_NAME, emoji: '✂️', toolType: TOOL_TYPE_DESKTOP }, tool: new PatchTool(renderer) },
    { meta: { name: SEARCH_FILES_TOOL_NAME, emoji: '🔍', toolType: TOOL_TYPE_DESKTOP }, tool: new SearchFilesTool(renderer) },
    { meta: { name: WEB_SEARCH_TOOL_NAME, emoji: '🌐', toolType: TOOL_TYPE_DESKTOP }, tool: new WebSearchTool(renderer, webProvider) },
    { meta: { name: WEB_EXTRACT_TOOL_NAME, emoji: '📰', toolType: TOOL_TYPE_DESKTOP }, tool: new WebExtractTool(renderer, webProvider) },
    { meta: { name: TEXT_TO_SPEECH_TOOL_NAME, emoji: '🔊', toolType: TOOL_TYPE_DESKTOP }, tool: new TextToSpeechTool(renderer, audioToolProvider) },
    { meta: { name: SPEECH_TO_TEXT_TOOL_NAME, emoji: '🎤', toolType: TOOL_TYPE_DESKTOP }, tool: new SpeechToTextTool(renderer, audioToolProvider) },
    { meta: { name: SCHEDULE_TIMER_TOOL_NAME, emoji: '⏰', toolType: TOOL_TYPE_DESKTOP }, tool: new ScheduleTimerTool(renderer) },
    { meta: { name: FILE_MUTATION_VERIFIER_TOOL_NAME, emoji: '🔬', toolType: TOOL_TYPE_DESKTOP }, tool: new FileMutationVerifierTool(renderer) },
    { meta: { name: COMPUTER_USE_TOOL_NAME, emoji: '🖥️', toolType: TOOL_TYPE_DESKTOP }, tool: new ComputerUseTool(renderer, computerUseProvider) },
    { meta: { name: VISION_RECOGNIZE_TOOL_NAME, emoji: '👁️', toolType: TOOL_TYPE_DESKTOP }, tool: new VisionRecognizeTool(renderer, visionProvider) },
  ]
  // ── 插件管理工具（Agent 可操作插件生命周期；依赖 PluginManager） ──
  const pluginTools: AgentToolRegistration[] = [
    { meta: { name: PLUGIN_INSTALL_TOOL_NAME, emoji: '🧩' }, tool: new PluginInstallTool(renderer, pluginManager) },
    { meta: { name: PLUGIN_CONFIGURE_TOOL_NAME, emoji: '⚙️' }, tool: new PluginConfigureTool(renderer, pluginManager) },
    { meta: { name: PLUGIN_ENABLE_TOOL_NAME, emoji: '✅' }, tool: new PluginEnableTool(renderer, pluginManager) },
    { meta: { name: PLUGIN_LIST_TOOL_NAME, emoji: '📦' }, tool: new PluginListTool(renderer, pluginManager) },
    { meta: { name: PLUGIN_UNINSTALL_TOOL_NAME, emoji: '🗑️' }, tool: new PluginUninstallTool(renderer, pluginManager) },
  ]

  const toolManager = new ToolManager([...builtinTools, ...desktopTools, ...pluginTools, ...toolRegistrations])
  // 工具禁用黑名单持久化（user_disabled_tools 表——PK(profile, tool_name)）
  const userDisabledToolService = new UserDisabledToolService(new UserDisabledToolRepository())
  toolManager.loadDisabled(userDisabledToolService.listAll())
  toolManager.setPersistence((profile, toolNames) => userDisabledToolService.replaceProfile(profile, toolNames))
  // MCP 工具同构注册：McpToolCenter 连接后生成 McpTool 实例 → 动态注册进统一注册中心
  // （toolType=mcp，ToolManager.execute 按类型路由到 MCP 统一执行器）
  const mcpCenter = getMcpToolCenter()
  mcpCenter.attachToolManager(toolManager)
  // 启动恢复：从库加载已注册 MCP 工具 → check 可用性 → 注册（无需重新 discover）
  void mcpCenter.restoreFromDb()

  // ── 模型配置解析服务（custom_models + providers → ModelConfig[]） ──
  // （已提前到 pluginManager 区——vision provider 依赖场景模型解析）

  // ── 安全门检服务（TinkerAgent 工具门检用，需在 TinkerAgent 之前组装） ──
  const sandboxWhitelistService = new SandboxWhitelistService(new UserUrlWhitelistRepository(), new UserPathWhitelistRepository())
  const toolAuthService = new ToolAuthService()

  // ── TinkerAgent ──
  // OO 化：不再建单例——AgentController 按 session 惰性 new TinkerAgent（构造绑定 sessionId/profile）
  const agentLoopOptions = {
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
  }

  // ── Controller 层依赖 ──
  const agentRepo = new AgentRepository()
  const agentConfigRepo = new AgentConfigRepository()
  const providerRepo = new SystemProviderRepository()
  const sceneRepo = new UserSceneModelRepository()
  const skillCategoryService = new SkillCategoryService(new SkillCategoryRepository())
  const promptService = new PromptService(new PromptModuleRepository())
  const customModelService = new UserCustomModelService(CustomModelRepository, providerRepo)
  const sceneModelService = new SceneModelService(sceneRepo, operationManager)
  // ── Agent Mode：注册表 + 默认模式，agentService 创建时需要 ---
  const agentModeRegistry = new AgentModeRegistry()
  agentModeRegistry.register(new DefaultAgentMode(renderer))
  const agentService = new AgentService(agentRepo, agentConfigRepo, agentModeRegistry)
  const agentConfigService = new AgentConfigService(agentConfigRepo, agentService, agentModeRegistry)
  const systemProviderService = new SystemProviderService(providerRepo)
  const agentModeService = new AgentModeService(agentModeRegistry, agentService)
  const accountService = new AccountService(agentService, agentConfigService, customModelService, sceneModelService)
  const sessionContextFactory = new SessionContextFactory(agentConfigService, sessionService, agentModeRegistry, agentService)

  return {
    agentLoopOptions,
    messageService,
    conversationService,
    sessionService,
    compactionService,
    memoryStore,
    promptManager,
    promptModuleBuilder,
    toolManager,
    pluginManager,
    llmRouter,
    modelConfigService,
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
    webProviderService: webProvider,
    audioToolProvider,
    agentModeRegistry,
    agentModeService,
    mcpToolCenter: mcpCenter,
  }
}
