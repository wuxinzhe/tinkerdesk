/**
 * updater.ts — 主进程
 * 自动更新模块。启动时自动检查，发现更新后后台下载，
 * 通过 IPC 通知 renderer 更新状态。
 *
 * 更新服务器：update.tinker-ai.com/releases/
 * Nginx 反向代理，后续切换存储不需改客户端。
 */
import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain, app } from 'electron'
import { nowDb } from './utils/time'

// ── 常量 ──

const UPDATE_FEED_URL = 'https://update.tinker-ai.com/releases/'

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
    provider: 'generic',
    url: UPDATE_FEED_URL
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
  ipcMain.handle('update:check', async (_event, manual: boolean = false): Promise<{ok: boolean; error?: string}> => {
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
  ipcMain.handle('update:install', async (): Promise<{ok: boolean; error?: string}> => {
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
  ipcMain.handle('app:version', async (): Promise<{ok: boolean; error?: string; data?: {version: string}}> => {
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
