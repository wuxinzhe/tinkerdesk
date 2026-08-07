import { app, BrowserWindow, ipcMain, Menu, session } from 'electron'
import { join } from 'path'
import { initLogger } from './utils/logger'
import { initDatabase, closeDatabase } from './repository/database'
import { bootstrap } from './bootstrap'
import { AgentController } from './controller/agent-controller'
import { AgentModeController } from './controller/agent-mode-controller'
import { SessionController } from './controller/session-controller'
import { MessageController } from './controller/message-controller'
import { AgentCrudController } from './controller/agent-manager-controller'
import { AgentConfigController } from './controller/agent-config-controller'
import { ToolController } from './controller/tool-controller'
import { SkillController } from './controller/skill-controller'
import { PromptModuleController } from './controller/prompt-module-controller'
import { SandboxController } from './controller/sandbox-controller'
import { ModelController } from './controller/model-controller'
import { AccountController } from './controller/account-controller'
import { McpController } from './controller/mcp-controller'
import { PluginController } from './controller/plugin-controller'
import { PluginManager } from './core/plugin/plugin-manager'
import { VoiceProviderService } from './service/voice-provider-service'
import { VoiceController } from './controller/voice-controller'
import { GeneralSettingsController } from './controller/general-settings-controller'
import { initUpdater, registerUpdaterHandlers, checkForUpdatesOnStartup } from './updater'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  Menu.setApplicationMenu(null)

  // 麦克风权限：语音输入是应用固有功能，直接允许（本地应用；media 覆盖音视频采集）
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 320,
    minHeight:720,
    frame: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    // 开发模式自动打开 DevTools
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 支持 F12 切换 DevTools（开发模式）
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12' && process.env.ELECTRON_RENDERER_URL) {
      mainWindow?.webContents.toggleDevTools()
    }
  })
}

app.whenReady().then(() => {
  // 日志文件系统最先初始化（后续所有 console 输出落盘）
  initLogger()
  // 初始化本地数据库（SQLite，custom_models 等表）
  initDatabase()

  // ── Agent 会话（本地 AgentLoop）：组装依赖 + 注册 IPC ──
  const desk = bootstrap([], [])
  new AgentController(desk.agentLoop, desk.sessionContextFactory).register()
  new SessionController(desk.sessionService).register()
  new MessageController(desk.messageService).register()
  new AgentCrudController(desk.agentService).register()
  new AgentConfigController(desk.agentConfigService).register()
  new ToolController(desk.toolManager).register()
  new SkillController(desk.privateSkillService, desk.skillCategoryService, () => mainWindow).register()
  new PromptModuleController(desk.promptService).register()
  new SandboxController(desk.sandboxWhitelistService).register()

  // 注册 IPC handlers
  new McpController(desk.mcpToolCenter).register()
  new ModelController(desk.customModelService, desk.sceneModelService, desk.systemProviderService).register()
  new AgentModeController(desk.agentModeService).register()
  new AccountController(desk.accountService).register()

  // ── 插件系统：扫描加载 + IPC（插件不进应用包，用户自行下载到 plugins/） ──
  desk.pluginManager.loadAll()
  new PluginController(desk.pluginManager, () => mainWindow).register()

  // ── 语音服务：系统固定接口（voice.stt/voice.tts）转发给插件 provider ──
  const voiceService = new VoiceProviderService(desk.pluginManager)
  new VoiceController(voiceService).register()

  // ── 通用设置（快捷键等全局键值配置） ──
  new GeneralSettingsController().register()

  // ── 窗口控制 IPC ──
  ipcMain.handle('window:minimize', () => { mainWindow?.minimize() })
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) { mainWindow.unmaximize() } else { mainWindow?.maximize() }
  })
  ipcMain.handle('window:close', () => { mainWindow?.close() })
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

  // 自动更新初始化
  initUpdater()
  registerUpdaterHandlers()

  createWindow()
  // 插件事件转发目标（窗口就绪后注入）
  desk.pluginManager.setEmitTarget(mainWindow?.webContents ?? null)
  checkForUpdatesOnStartup()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase()
    app.quit()
  }
})
