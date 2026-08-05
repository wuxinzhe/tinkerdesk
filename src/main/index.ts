import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { detectDesktopTools } from './tool-detector'
import { registerToolHandlers } from './ipc-handlers'
import { registerToolCenterHandlers } from './tool-center'
import { registerModelIpcHandlers } from './model-ipc'
import { initDatabase, closeDatabase } from './repository/database'
import { bootstrap } from './bootstrap'
import { registerAgentController } from './agent-controller'
import { initUpdater, registerUpdaterHandlers, checkForUpdatesOnStartup } from './updater'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  Menu.setApplicationMenu(null)

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
  // 初始化本地数据库（SQLite，custom_models 等表）
  initDatabase()

  // ── Agent 会话（本地 AgentLoop）：组装依赖 + 注册 IPC ──
  const desk = bootstrap([], [])
  registerAgentController(desk.agentLoop)

  // 注册 IPC handlers
  ipcMain.handle('detect-tools', () => detectDesktopTools())
  registerToolHandlers()
  registerToolCenterHandlers()
  registerModelIpcHandlers()

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
  checkForUpdatesOnStartup()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase()
    app.quit()
  }
})
