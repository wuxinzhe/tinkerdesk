import { app, BrowserWindow, Menu, session, screen } from 'electron'
import { handleTrusted } from './security/ipc-guard'
import { join } from 'path'
import { initLogger } from './utils/logger'
import { initDatabase, closeDatabase } from './repository/database'
import { bootstrap } from './bootstrap'
import { AgentController } from './controller/agent-controller'
import { AgentModeController } from './controller/agent-mode-controller'
import { SessionController } from './controller/session-controller'
import { MediaController } from './controller/media-controller'
import { MessageController } from './controller/message-controller'
import { AgentCrudController } from './controller/agent-manager-controller'
import { AgentConfigController } from './controller/agent-config-controller'
import { ToolController } from './controller/tool-controller'
import { WebProviderController } from './controller/web-provider-controller'
import { AudioToolProviderController } from './controller/audio-tool-provider-controller'
import { SkillController } from './controller/skill-controller'
import { PromptModuleController } from './controller/prompt-module-controller'
import { SandboxController } from './controller/sandbox-controller'
import { ModelController } from './controller/model-controller'
import { AccountController } from './controller/account-controller'
import { MemoryController } from './controller/memory-controller'
import { McpController } from './controller/mcp-controller'
import { PluginController } from './controller/plugin-controller'
import { VoiceProviderService } from './service/voice-provider-service'
import { VoiceController } from './controller/voice-controller'
import { GeneralSettingsController } from './controller/general-settings-controller'
import { initUpdater, registerUpdaterHandlers, checkForUpdatesOnStartup } from './updater'
import { registerMediaProtocol } from './service/media-service'
import { protocol } from 'electron'

// app-media:// 自定义协议特权声明（必须在 app ready 前）：
// stream: true —— audio/video 媒体管线必需（否则自定义协议音频 Format error）
// standard + secure —— URL 解析为标准 scheme + 视为安全上下文
protocol.registerSchemesAsPrivileged([
  { scheme: 'app-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
])

let mainWindow: BrowserWindow | null = null

// ── 全局异常兜底（不静默：日志 + 推送前端 global-tip 中文提示）──
// 覆盖漏网的 uncaughtException / unhandledRejection——保证任何异常都有记录 + 用户可见
function pushFatalTip(message: string): void {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('global-tip', { type: 'error', code: 'fatal', message })
    }
  } catch {
    // 窗口不可用（启动早期/已销毁）——静默（日志已记录）
  }
}

process.on('uncaughtException', (err) => {
  console.error('[fatal] 未捕获异常:', err)
  pushFatalTip('程序发生内部错误（未捕获异常），请查看日志后重试')
})

process.on('unhandledRejection', (reason) => {
  console.error('[fatal-reject] 未处理的 Promise 拒绝:', reason)
  pushFatalTip('程序发生内部错误（异步操作失败），请查看日志后重试')
})

function createWindow() {
  Menu.setApplicationMenu(null)

  // 麦克风权限：语音输入是应用固有功能，直接允许（本地应用；media 覆盖音视频采集）
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    /* 最小宽度 768（断点下限——低于此手机布局不再出现；minHeight 720 保持） */
    minWidth: 768,
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

  // ── 无边框窗口贴靠布局修正 ──
  // 有边框窗口：Windows 贴靠自动扣除任务栏（WM_GETMINMAXINFO）。
  // frame:false 无边框窗口：Windows 贴靠给的 bounds 高度 = 屏幕高度（含任务栏），
  // 导致窗口底部伸到任务栏下面（输入框被挡）。
  // resize 时若窗口超出 workArea（任务栏区域）——clip 回 workArea。
  let snapFixLock = false
  mainWindow.on('resize', () => {
    if (snapFixLock || !mainWindow) return
    const bounds = mainWindow.getBounds()
    const wa = screen.getDisplayMatching(bounds).workArea
    // 下沿超出 workArea（盖住任务栏）或上沿被推出——修正到 workArea 内（±2 容差）
    const overBottom = bounds.y + bounds.height > wa.y + wa.height + 2
    const overTop = bounds.y < wa.y - 2
    if (overBottom || overTop) {
      snapFixLock = true
      mainWindow.setBounds({
        x: bounds.x,
        y: Math.max(bounds.y, wa.y),
        width: bounds.width,
        height: Math.min(bounds.height, wa.height),
      })
      snapFixLock = false
    }
  })

  // 支持 F12 切换 DevTools（开发模式）
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12' && process.env.ELECTRON_RENDERER_URL) {
      mainWindow?.webContents.toggleDevTools()
    }
  })
}

app.whenReady().then(() => {
  // app-media:// 协议（聊天媒体附件渲染——只读 media 目录）
  registerMediaProtocol()

  // 日志文件系统最先初始化（后续所有 console 输出落盘）
  initLogger()
  // 初始化本地数据库（SQLite，custom_models 等表）
  initDatabase()

  // ── Agent 会话（本地 TinkerAgent）：组装依赖 + 注册 IPC ──
  const desk = bootstrap([], [])
  new AgentController(desk.agentLoopOptions, desk.sessionContextFactory, desk.sessionService, desk.messageService).register()
  new SessionController(desk.sessionService, desk.memoryStore, desk.agentConfigService, desk.modelConfigService).register()
  new MessageController(desk.messageService).register()
  new MediaController().register()
  new AgentCrudController(desk.agentService, desk.memoryStore, desk.agentConfigService).register()
  new AgentConfigController(desk.agentConfigService).register()
  new ToolController(desk.toolManager).register()
  new WebProviderController(desk.webProviderService).register()
  new AudioToolProviderController(desk.audioToolProvider).register()
  new SkillController(desk.privateSkillService, desk.skillCategoryService, () => mainWindow).register()
  new PromptModuleController(desk.promptService).register()
  new SandboxController(desk.sandboxWhitelistService).register()

  // 注册 IPC handlers
  new McpController(desk.mcpToolCenter).register()
  new ModelController(desk.customModelService, desk.sceneModelService, desk.systemProviderService).register()
  new AgentModeController(desk.agentModeService).register()
  new AccountController(desk.accountService).register()
  new MemoryController(desk.memoryStore).register()

  // ── 插件系统：扫描加载 + IPC（插件不进应用包，用户自行下载到 plugins/） ──
  desk.pluginManager.loadAll()
  new PluginController(desk.pluginManager, () => mainWindow).register()

  // ── 语音服务：系统固定接口（voice.stt/voice.tts）转发给插件 provider ──
  const voiceService = new VoiceProviderService(desk.pluginManager)
  new VoiceController(voiceService).register()

  // ── 通用设置（快捷键等全局键值配置） ──
  new GeneralSettingsController().register()

  // ── 窗口控制 IPC ──
  handleTrusted('window:minimize', () => { mainWindow?.minimize() })
  handleTrusted('window:maximize', () => {
    if (mainWindow?.isMaximized()) { mainWindow.unmaximize() } else { mainWindow?.maximize() }
  })
  handleTrusted('window:close', () => { mainWindow?.close() })
  handleTrusted('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

  // ── 专注模式（TitleBar 切换——临时突破 minWidth 768） ──
  // 点击进入：最小宽 375 + 窗口 375×812（窄窗聚焦）；再点恢复：minWidth 768 + 1200×800
  let phoneModeActive = false
  handleTrusted('window:phoneMode', () => {
    phoneModeActive = !phoneModeActive
    if (phoneModeActive) {
      mainWindow?.setMinimumSize(375, 600)
      mainWindow?.setSize(375, 812)
    } else {
      mainWindow?.setMinimumSize(768, 720)
      mainWindow?.setSize(1200, 800)
    }
    return phoneModeActive
  })

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
