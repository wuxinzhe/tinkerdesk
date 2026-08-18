/**
 * assemble-agent-loop.ts — Agent 运行时装配（单一来源）
 *
 * 把主进程 bootstrap 里「Agent 运行时装配」整段提取为一处可复用的装配函数，
 * 供主进程（bootstrap.ts）与未来的 AgentWorker 进程共用同一套业务层装配代码，
 * 保证两者装配结果行为完全一致。
 *
 * 职责范围：LLM 调用与路由 → Service 层 → Prompt → Tools/Provider → 安全门检
 * → AgentMode 注册 → 最终 TinkerAgent 装配选项（agentLoopOptions）与会话上下文工厂。
 * 不包含数据库初始化（initDatabase 属于主进程 DB bootstrap，留在 bootstrap.ts）。
 */
import { ConversationRepository } from '../../repository/conversation-repository'
import { MessageRepository } from '../../repository/message-repository'
import { SessionRepository } from '../../repository/session-repository'

import { CompactionService } from '../../service/compaction-service'
import { CompressionCooldownStore } from '../../service/compression-cooldown-store'
import { ConversationService } from '../../service/conversation-service'
import { MemoryStore } from '../../service/memory-store'
import { MessageService } from '../../service/message-service'
import { SessionService } from '../../service/session-service'

import type { IDynamicPromptModule } from '../prompt'
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
} from '../prompt'

import { AnthropicClient, GoogleClient, LlmClientManager, LlmOperationManager, LlmRouter, OpenAIClient } from '../llm'

import { ChatOperation } from '../llm/operations/chat-operation'
import { SummaryOperation } from '../llm/operations/summary-operation'
import { TitleOperation } from '../llm/operations/title-operation'
import { VisionOperation } from '../llm/operations/vision-operation'
import { AgentModeRegistry } from '../mode/agent-mode-registry'
import { ProviderCenter } from '../provider/provider-center'
import { ProviderManager } from '../provider/provider-manager'
import { ToolCenter } from '../tool/tool-center'
import { AgentConfigRepository } from '../../repository/agent-config-repository'
import { AgentRepository } from '../../repository/agent-repository'
import { CustomModelRepository } from '../../repository/custom-model-repository'
import { PrivateSkillFileRepository } from '../../repository/private-skill-file-repository'
import { PrivateSkillRelatedRepository } from '../../repository/private-skill-related-repository'
import { PrivateSkillRepository } from '../../repository/private-skill-repository'
import { PromptModuleRepository } from '../../repository/prompt-module-repository'
import { ProviderRepository } from '../../repository/providers-repository'
import { SkillCategoryRepository } from '../../repository/skill-category-repository'
import { SystemProviderRepository } from '../../repository/system-provider-repository'
import { UserPathWhitelistRepository } from '../../repository/user-path-whitelist-repository'
import { UserSceneModelRepository } from '../../repository/user-scene-model-repository'
import { UserUrlWhitelistRepository } from '../../repository/user-url-whitelist-repository'
import { AccountService } from '../../service/account-service'
import { AgentConfigService } from '../../service/agent-config-service'
import { WebProvider } from '../../service/web-provider'
import { AudioToolProvider } from '../../service/audio-tool-provider'
import { EDGE_TTS_MANIFEST, edgeTtsProvider } from '../../builtins/providers/tts/edge'
import { AgentToolRepository } from '../../repository/agent-tool-repository'
import { AgentToolService } from '../../service/agent-tool-service'
import { AgentModeService } from '../../service/agent-mode-service'
import { AgentService } from '../../service/agent-service'
import { DefaultAgentMode } from '../../builtins/modes/default-agent-mode'
import { MinimalAgentMode } from '../../builtins/modes/minimal-agent-mode'
import { CreatorAgentMode } from '../../builtins/modes/creator-agent-mode'
import { ButlerAgentMode } from '../../builtins/modes/butler-agent-mode'
import { ModelConfigService } from '../../service/model-config-service'
import { PrivateSkillService } from '../../service/private-skill-service'
import { PromptService } from '../../service/prompt-service'
import { SandboxWhitelistService } from '../../service/sandbox-whitelist-service'
import { SceneModelService } from '../../service/scene-model-service'
import { SessionContextFactory } from '../../service/session-context-factory'
import { SkillCategoryService } from '../../service/skill-category-service'
import { SystemProviderService } from '../../service/system-provider-service'
import { TodoService } from '../../service/todo-service'
import { ToolAuthService } from '../../service/tool-auth-service'
import { UserCustomModelService } from '../../service/user-custom-model-service'
import type { AgentToolRegistration } from '../../builtins/tools'
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
} from '../../builtins/tools'
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
  PwshTool,
  PWSH_TOOL_NAME,
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
} from '../../builtins/tools'
import {
  PROVIDER_CONFIGURE_TOOL_NAME,
  PROVIDER_ENABLE_TOOL_NAME,
  PROVIDER_INSTALL_TOOL_NAME,
  PROVIDER_LIST_TOOL_NAME,
  PROVIDER_UNINSTALL_TOOL_NAME,
  ProviderConfigureTool,
  ProviderEnableTool,
  ProviderInstallTool,
  ProviderListTool,
  ProviderUninstallTool,
} from '../../builtins/tools/provider-tools'

import type { TinkerAgentOptions } from '../loop/types'
import { ToolManager } from '../tool'
import { DelegateTool } from '../../builtins/tools/delegate-tool'
import { VisionRecognizeTool, TOOL_NAME as VISION_RECOGNIZE_TOOL_NAME } from '../../builtins/tools/vision-tool'
import { VisionProvider } from '../../service/vision-provider'

/**
 * Agent 运行时装配的入参。
 * - userDataPath：todo/memory 等本地文件存储的根目录（bootstrap 由 app.getPath('userData') 提供）。
 * - promptModules / toolRegistrations：调用方注入的动态 prompt 模块与自定义工具。
 */
export interface AgentLoopDeps {
  /** 用户数据目录（替代 electron app.getPath('userData')——worker 进程可自行传入） */
  userDataPath: string
  /** 调用方自定义动态 prompt 模块 */
  promptModules: IDynamicPromptModule[]
  /** 调用方自定义工具注册 */
  toolRegistrations: AgentToolRegistration[]
}

/**
 * Agent 运行时装配结果（单一来源——bootstrap 据此组装 desk 与 controller，
 * 未来的 AgentWorker 进程可复用同一套装配）。
 */
export interface AgentLoopAssembly {
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
  /** 工具中心（外置工具包安装/卸载/可用性） */
  toolCenter: ToolCenter
  /** 工具授权服务（DB agent_tools——授权/回收/装配 toolNameSet） */
  agentToolService: AgentToolService
  providerCenter: ProviderCenter
  providerManager: ProviderManager
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
}

/**
 * 装配整个 Agent 运行时（LLM → Service → Prompt → Tools/Provider → 安全门检
 * → AgentMode → TinkerAgent 装配选项）。
 *
 * 行为与原先 bootstrap.ts 内联装配完全一致（顺序、依赖注入、closure 延迟解析不变）。
 */
export function assembleAgentLoop(deps: AgentLoopDeps): AgentLoopAssembly {
  const { userDataPath, promptModules, toolRegistrations } = deps

  // ── DB repos（Agent 链路所需 repository）──
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
  const todoService = new TodoService(userDataPath)
  const compactionService = new CompactionService(llmRouter, messageService, conversationService, cooldownStore, todoService, sessionRepo)

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
  const memoryStore = new MemoryStore(userDataPath)
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
  // 静态提示词模块（用户自定义——prompt_modules 表——构建 system prompt 时加载）
  const staticModuleRepo = {
    findByProfile: (profile: string) => {
      const repo = new PromptModuleRepository()
      return repo.findByProfile(profile).map((m) => ({
        id: String(m.id),
        content: m.content,
        enabled: m.enabled,
        sortOrder: m.sortOrder,
      }))
    },
  }
  const promptModuleBuilder = new PromptModuleBuilder(promptManager, sessionRepo, staticModuleRepo, renderer)

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
  // ── Desktop 工具（客户端工具，与内建隔离在 tools/） ──
  // ── 扩展管理（提前创建：desktopTools 的 web/audio 工具需要 provider 服务） ──
  const providerCenter = new ProviderCenter()
  const providerManager = new ProviderManager(providerCenter)
  // 内置扩展（代码注册——出现在扩展列表、可配置，不可卸载）
  providerCenter.registerBuiltinProvider({ manifest: EDGE_TTS_MANIFEST, provider: edgeTtsProvider })
  const webProvider = new WebProvider(providerCenter)
  const audioToolProvider = new AudioToolProvider(providerCenter)
  // 模型配置解析服务（custom_models + providers → ModelConfig[]）——vision provider 依赖（场景模型解析）
  const modelConfigService = new ModelConfigService(CustomModelRepository, ProviderRepository, new UserSceneModelRepository())
  const visionProvider = new VisionProvider(llmRouter, modelConfigService)

  const desktopTools: AgentToolRegistration[] = [
    { meta: { name: TERMINAL_TOOL_NAME, emoji: '💻' }, tool: new TerminalTool(renderer) },
    { meta: { name: PWSH_TOOL_NAME, emoji: '💻' }, tool: new PwshTool(renderer) },
    { meta: { name: PROCESS_TOOL_NAME, emoji: '⚙️' }, tool: new ProcessTool(renderer) },
    { meta: { name: READ_TERMINAL_TOOL_NAME, emoji: '📋' }, tool: new ReadTerminalTool(renderer) },
    { meta: { name: CLOSE_TERMINAL_TOOL_NAME, emoji: '🔌' }, tool: new CloseTerminalTool(renderer) },
    { meta: { name: READ_FILE_TOOL_NAME, emoji: '📄' }, tool: new ReadFileTool(renderer) },
    { meta: { name: WRITE_FILE_TOOL_NAME, emoji: '📝' }, tool: new WriteFileTool(renderer) },
    { meta: { name: PATCH_TOOL_NAME, emoji: '✂️' }, tool: new PatchTool(renderer) },
    { meta: { name: SEARCH_FILES_TOOL_NAME, emoji: '🔍' }, tool: new SearchFilesTool(renderer) },
    { meta: { name: WEB_SEARCH_TOOL_NAME, emoji: '🌐' }, tool: new WebSearchTool(renderer, webProvider) },
    { meta: { name: WEB_EXTRACT_TOOL_NAME, emoji: '📰' }, tool: new WebExtractTool(renderer, webProvider) },
    { meta: { name: TEXT_TO_SPEECH_TOOL_NAME, emoji: '🔊' }, tool: new TextToSpeechTool(renderer, audioToolProvider) },
    { meta: { name: SPEECH_TO_TEXT_TOOL_NAME, emoji: '🎤' }, tool: new SpeechToTextTool(renderer, audioToolProvider) },
    { meta: { name: SCHEDULE_TIMER_TOOL_NAME, emoji: '⏰' }, tool: new ScheduleTimerTool(renderer) },
    { meta: { name: FILE_MUTATION_VERIFIER_TOOL_NAME, emoji: '🔬' }, tool: new FileMutationVerifierTool(renderer) },
    { meta: { name: VISION_RECOGNIZE_TOOL_NAME, emoji: '👁️' }, tool: new VisionRecognizeTool(renderer, visionProvider) },
  ]
  // ── 扩展管理工具（Agent 可操作扩展生命周期；依赖 ProviderManager） ──
  const providerTools: AgentToolRegistration[] = [
    { meta: { name: PROVIDER_INSTALL_TOOL_NAME, emoji: '🧩' }, tool: new ProviderInstallTool(renderer, providerCenter) },
    { meta: { name: PROVIDER_CONFIGURE_TOOL_NAME, emoji: '⚙️' }, tool: new ProviderConfigureTool(renderer, providerCenter, providerManager) },
    { meta: { name: PROVIDER_ENABLE_TOOL_NAME, emoji: '✅' }, tool: new ProviderEnableTool(renderer, providerCenter) },
    { meta: { name: PROVIDER_LIST_TOOL_NAME, emoji: '📦' }, tool: new ProviderListTool(renderer, providerCenter) },
    { meta: { name: PROVIDER_UNINSTALL_TOOL_NAME, emoji: '🗑️' }, tool: new ProviderUninstallTool(renderer, providerCenter) },
  ]

  const toolManager = new ToolManager()
  // 工具中心：启动统一注册两类工具（代码内置 + 外置安装）——逐 check 可用性只注册可用
  const toolCenter = new ToolCenter({ toolManager, installer: providerCenter.getInstaller(), builtin: [...builtinTools, ...desktopTools, ...providerTools, ...toolRegistrations] })
  toolCenter.loadAll()
  // ── 模型配置解析服务（custom_models + providers → ModelConfig[]） ──
  // （已提前到 providerManager 区——vision provider 依赖场景模型解析）

  // ── 安全门检服务（TinkerAgent 工具门检用，需在 TinkerAgent 之前组装） ──
  const sandboxWhitelistService = new SandboxWhitelistService(new UserUrlWhitelistRepository(), new UserPathWhitelistRepository())
  const toolAuthService = new ToolAuthService()

  // ── TinkerAgent ──
  // 工具授权服务（DB agent_tools——装配/授权/回收）
  const agentToolService = new AgentToolService(new AgentToolRepository())
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
    agentToolService,
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
  agentModeRegistry.register(new DefaultAgentMode(renderer, toolManager))
  agentModeRegistry.register(new MinimalAgentMode())
  agentModeRegistry.register(new CreatorAgentMode(toolManager, agentToolService))
  agentModeRegistry.register(new ButlerAgentMode())
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
    toolCenter,
    agentToolService,
    providerCenter,
    providerManager,
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
  }
}
