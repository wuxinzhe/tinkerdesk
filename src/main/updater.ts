/**
 * updater.ts — 主进程
 * Auto-update module. Checks on startup, downloads in the background when an
 * update is found, notifies the renderer of update status via IPC.
 *
 * Update server: update.tinker-ai.com/releases/
 * Nginx reverse proxy; switching storage later doesn't require client changes.
 */
import { autoUpdater } from 'electron-updater'
import { handleTrusted } from './security/ipc-guard'
import { BrowserWindow, app} from 'electron'

// ── 常量 ──

/** 更新源：GitHub Releases（wuxinzhe/tinkerdesk——latest.yml + 安装包 + blockmap 附件） */
const UPDATE_OWNER = 'wuxinzhe'
const UPDATE_REPO = 'tinkerdesk'

// ── 日志 ──

const log = (...args: unknown[]) => console.log('[AutoUpdater]', ...args)

// ── 通知 renderer ──

function send(channel: string, data?: unknown) {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data)
  }
}

// ── 初始化 ──

export function initUpdater(): void {
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: UPDATE_OWNER,
    repo: UPDATE_REPO,
    private: false,
  })

  autoUpdater.autoDownload = true
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = console

  // ── 事件监听 ──

  autoUpdater.on('checking-for-update', () => {
    log('正在检查更新...')
    send('update:status', { status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    log('发现新版本:', info.version)
    send('update:status', { status: 'available', version: info.version, releaseDate: info.releaseDate })
  })

  autoUpdater.on('update-not-available', (info) => {
    log('当前已是最新版本:', info.version)
    send('update:status', { status: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress) => {
    send('update:progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      downloaded: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log('更新下载完成:', info.version)
    send('update:status', {
      status: 'downloaded',
      version: info.version,
      releaseDate: info.releaseDate
    })
  })

  autoUpdater.on('error', (err) => {
    log('更新错误:', err.message)
    send('update:status', { status: 'error', error: err.message })
  })
}

// ── IPC handlers ──

export function registerUpdaterHandlers(): void {
  // 检查更新
  handleTrusted('update:check', async (_event, manual: boolean = false): Promise<{ok: boolean; error?: string}> => {
    try {
      log(`检查更新 (manual=${manual})`)
      autoUpdater.autoDownload = !manual // 手动检查时只通知不下发
      autoUpdater.checkForUpdates()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // 安装更新
  handleTrusted('update:install', async (): Promise<{ok: boolean; error?: string}> => {
    try {
      log('安装更新...')
      setImmediate(() => {
        autoUpdater.quitAndInstall(true, true)
      })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // 获取当前版本
  handleTrusted('app:version', async (): Promise<{ok: boolean; error?: string; data?: {version: string}}> => {
    return { ok: true, data: { version: app.getVersion() } }
  })
}

// ── 启动时自动检查 ──

export function checkForUpdatesOnStartup(): void {
  // 延迟 3 秒检查，优先让应用完成启动
  setTimeout(() => {
    autoUpdater.autoDownload = true
    autoUpdater.checkForUpdates()
  }, 3000)
}
