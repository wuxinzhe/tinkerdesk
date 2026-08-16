/**
 * plugin-controller.ts — 插件管理 IPC（对齐 Controller 规范：独立具名方法 + register 绑定）
 *
 * Channels:
 *   plugin:list         → plugin list (manifest + status)
 *   plugin:toggle       → enable/disable plugin { id, enabled }
 *   plugin:get-status   → live status (incl. plugin-custom detail)
 *   plugin:get-schema   → config schema (dynamic form rendering)
 *   plugin:get-config   → read config (secrets masked)
 *   plugin:save-config  → save config { id, patch }
 */
import { dialog, BrowserWindow} from 'electron'
import { handleTrusted } from '../security/ipc-guard'
import {  existsSync, statSync } from 'fs'
import { join } from 'path'
import { PluginManager } from '../core/plugin/plugin-manager'
import { getMarketPluginDetail, listMarketPlugins } from '../service/plugin-market-service'
import type { PluginCheckResult, PluginInfo, PluginStatus, ToggleResult } from '../core/plugin/types'

type ApiResult<T> = { success: true; data: T } | { success: false; error: string }

function ok<T>(data: T): ApiResult<T> {
  return { success: true, data }
}
function fail(error: string): ApiResult<never> {
  return { success: false, error }
}

export class PluginController {
  constructor(
    private readonly pluginManager: PluginManager,
    /** 主窗口提供者（文件对话框必须关联窗口，否则不显示） */
    private readonly getWindow: () => BrowserWindow | null,
  ) {}

  register(): void {
    handleTrusted('plugin:list', () => this.listPlugins())
    handleTrusted('plugin:toggle', (_event, payload: { id: string; enabled: boolean }) =>
      this.toggle(payload),
    )
    handleTrusted('plugin:check', (_event, payload: { id: string }) => this.check(payload))
    handleTrusted('plugin:get-status', (_event, payload: { id: string }) =>
      this.getPluginStatus(payload),
    )
    handleTrusted('plugin:get-schema', (_event, payload: { id: string }) =>
      this.getPluginSchema(payload),
    )
    handleTrusted('plugin:pick-file', (_event, payload: { filters?: { name: string; extensions: string[] }[] }) =>
      this.pickFile(payload),
    )
    handleTrusted('plugin:install', (_event, payload: { path: string }) => this.install(payload))
    handleTrusted('plugin:install-npm', (_event, payload: { pkg: string; registry?: string }) => this.installFromNpm(payload))
    handleTrusted('plugin:install-start', (_event, payload: { pkg?: string; path?: string; registry?: string }) => this.installStart(payload))
    handleTrusted('plugin:install-step', (_event, payload: { sessionId: string; stage: string; skipAssets?: string[] }) => this.installStep(payload))
    handleTrusted('plugin:install-download', (_event, payload: { sessionId: string }) => this.installDownload(payload))
    handleTrusted('plugin:market-list', (_event, payload: { category?: string; search?: string } = {}) => this.marketList(payload))
    handleTrusted('plugin:market-detail', (_event, payload: { name: string }) => this.marketDetail(payload))
    handleTrusted('plugin:uninstall', (_event, payload: { id: string }) => this.uninstall(payload))
    handleTrusted('plugin:pick-install-package', (_event, payload: { kind?: 'zip' | 'folder' }) =>
      this.pickInstallPackage(payload ?? {}),
    )
    handleTrusted('plugin:get-config', (_event, payload: { id: string }) =>
      this.getPluginConfig(payload),
    )
    handleTrusted('plugin:save-config', (_event, payload: { id: string; patch: Record<string, unknown> }) =>
      this.savePluginConfig(payload),
    )
    handleTrusted('plugin:download-assets', async (_event, payload: { id: string }) =>
      this.downloadAssets(payload),
    )
  }

  /** 主进程资源下载（不依赖 Worker——配置页下载按钮调用——进度经 plugin:assets-progress 事件推送） */
  private async downloadAssets(payload: { id: string }): Promise<ApiResult<{ name: string; ok: boolean; error?: string }[]>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      const id = payload.id
      const results = await this.pluginManager.downloadAssets(id, (depName, received, total) => {
        const wc = this.pluginManager.getEmitTarget()
        if (wc && !wc.isDestroyed()) {
          wc.send('plugin:assets-progress', { pluginId: id, depName, received, total })
        }
      })
      return ok(results)
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 插件列表 */
  private listPlugins(): ApiResult<PluginInfo[]> {
    try {
      return ok(this.pluginManager.list())
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 启停插件（启用前自检：不通过返回 checks 引导修复，不改变状态） */
  private async toggle(payload: { id: string; enabled: boolean }): Promise<ApiResult<ToggleResult>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      return ok(await this.pluginManager.toggle(payload.id, !!payload.enabled))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 选择插件安装包：按 kind 弹对应对话框（zip=文件选择器 / folder=目录选择器；分开弹——Windows 组合模式不显示文件） */
  private async pickInstallPackage(payload: { kind?: 'zip' | 'folder' }): Promise<ApiResult<string | null>> {
    try {
      const win = this.getWindow()
      if (!win) return ok(null)
      const kind = payload?.kind === 'folder' ? 'folder' : 'zip'
      const options: Electron.OpenDialogOptions = {
        title: kind === 'zip' ? '选择插件包（.zip）' : '选择插件文件夹',
        properties: kind === 'zip' ? ['openFile'] : ['openDirectory'],
        filters: kind === 'zip' ? [{ name: '插件包', extensions: ['zip'] }] : undefined,
      }
      const result = await dialog.showOpenDialog(win, options)
      return ok(result.canceled ? null : (result.filePaths[0] ?? null))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 安装插件：自动检测目录或 zip → 校验 → 复制到 plugins/ → 热加载（无需重启） */
  private async install(payload: { path: string }): Promise<ApiResult<PluginInfo>> {
    try {
      const info = await this.pluginManager.installFromPath(payload?.path ?? '')
      return ok(info)
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 在线安装插件（npm 包名——npm pack 下载 → 解压 → 标准安装） */
  private async installFromNpm(payload: { pkg: string; registry?: string }): Promise<ApiResult<PluginInfo>> {
    try {
      const info = await this.pluginManager.installFromNpm(payload?.pkg ?? '', payload?.registry ? { registry: payload.registry } : undefined)
      return ok(info)
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 分步安装：开始会话（validate 阶段——npm pack 下载或本地路径——返回 manifest 信息 + 资源清单） */
  private async installStart(payload: { pkg?: string; path?: string; registry?: string } = {}): Promise<ApiResult<unknown>> {
    try {
      const session = payload.pkg
        ? await this.pluginManager.startInstallNpm(payload.pkg, payload.registry ? { registry: payload.registry } : undefined)
        : this.pluginManager.startInstallPath(payload.path ?? '')
      return ok({
        sessionId: session.sessionId,
        sourceType: payload.pkg ? 'npm' : 'local',
        manifest: session.manifest
          ? { id: session.manifest.id, name: session.manifest.name, version: session.manifest.version, capabilities: session.manifest.capabilities ?? [] }
          : null,
        assetDeps: (session.manifest?.assetDeps ?? session.manifest?.modelDeps ?? []).map((d) => ({ name: d.name, dest: d.dest, sizeMB: d.sizeMB, optional: !!d.optional })),
        stages: session.stages,
      })
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 分步安装：执行下一步（copy/deps/assets/register——失败可重试该步） */
  private async installStep(payload: { sessionId: string; stage: string; skipAssets?: string[] }): Promise<ApiResult<unknown>> {
    try {
      const stage = payload?.stage as 'copy' | 'deps' | 'assets' | 'register'
      const session = this.pluginManager.getInstallSession(payload?.sessionId ?? '')
      if (!session) return fail('安装会话不存在或已过期')
      if (stage === 'assets' && payload.skipAssets) {
        session.skipAssets = payload.skipAssets
      }
      const r = await this.pluginManager.stepInstall(payload?.sessionId ?? '', stage)
      return ok({ ok: r.ok, error: r.error, stages: session.stages })
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 分步安装：下载 tarball（带进度——经 mainWindow 事件推送 renderer） */
  private async installDownload(payload: { sessionId: string }): Promise<ApiResult<unknown>> {
    try {
      const session = this.pluginManager.getInstallSession(payload?.sessionId ?? '')
      if (!session) return fail('安装会话不存在或已过期')
      await this.pluginManager.downloadInstallSession(payload?.sessionId ?? '', (received, total) => {
        // 进度事件推送（renderer 监听 plugin:install-progress）
        const wc = this.pluginManager.getEmitTarget()
        if (wc && !wc.isDestroyed()) {
          wc.send('plugin:install-progress', { sessionId: payload?.sessionId, received, total })
        }
      })
      return ok({
        ok: true,
        stages: session.stages,
        manifest: session.manifest
          ? { id: session.manifest.id, name: session.manifest.name, version: session.manifest.version, capabilities: session.manifest.capabilities ?? [] }
          : null,
        assetDeps: (session.manifest?.assetDeps ?? session.manifest?.modelDeps ?? []).map((d) => ({ name: d.name, dest: d.dest, sizeMB: d.sizeMB, optional: !!d.optional })),
      })
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 插件详情（npm 包元数据 + 官方标记 + 已安装——详情页） */
  private async marketDetail(payload: { name: string }): Promise<ApiResult<import('../service/plugin-market-service').MarketPluginDetail>> {
    try {
      const installedIds = this.pluginManager.list().map((p) => p.manifest.id)
      return ok(await getMarketPluginDetail(payload?.name ?? '', installedIds))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 插件市场列表（service 层——真实 npm 搜索——分类/搜索词透传） */
  private async marketList(payload: { category?: string; search?: string } = {}): Promise<ApiResult<import('../service/plugin-market-service').MarketListResult>> {
    try {
      const installedIds = this.pluginManager.list().map((p) => p.manifest.id)
      return ok(await listMarketPlugins({ installedIds, category: payload.category, search: payload.search }))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 在解压目录中定位含 manifest.json 的插件目录（根目录或一层子目录） */
  private locateManifestDir(root: string): string | null {
    if (existsSync(join(root, 'manifest.json'))) return root
    const { readdirSync } = require('fs')
    try {
      for (const name of readdirSync(root)) {
        const sub = join(root, name)
        if (statSync(sub).isDirectory() && existsSync(join(sub, 'manifest.json'))) {
          return sub
        }
      }
    } catch {
      // 忽略读取异常
    }
    return null
  }

  /** tar 命令：Windows 用 System32 自带 bsdtar（Electron PATH 的 tar 不可用）；Linux/macOS 用系统 tar */
  private tarBin(): string {
    if (process.platform === 'win32') {
      const sysRoot = process.env.SystemRoot ?? 'C:\\Windows'
      return join(sysRoot, 'System32', 'tar.exe')
    }
    return 'tar'
  }

  /** 卸载插件（一键删除插件及模型） */
  private uninstall(payload: { id: string }): ApiResult<void> {
    try {
      const id = payload?.id
      if (!id || !this.pluginManager.list().some((p) => p.manifest.id === id)) {
        return fail('插件不存在')
      }
      this.pluginManager.uninstallPlugin(id)
      return ok(undefined)
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 文件选择对话框（配置表单 file 字段用；必须关联主窗口，异步版） */
  private async pickFile(payload: { filters?: { name: string; extensions: string[] }[] }): Promise<ApiResult<string | null>> {
    try {
      const filters = payload?.filters?.length
        ? payload.filters.map((f) => ({ name: f.name ?? '文件', extensions: f.extensions ?? ['*'] }))
        : undefined
      const win = this.getWindow()
      console.log(`[plugin] pickFile 调用（win=${!!win}, filters=${JSON.stringify(filters ?? [])}）`)
      const options: Electron.OpenDialogOptions = {
        title: '选择文件',
        properties: ['openFile'],
        filters,
      }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      return ok(result.canceled ? null : (result.filePaths[0] ?? null))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 插件自检（不改变状态；启用按钮点击时先调） */
  private async check(payload: { id: string }): Promise<ApiResult<PluginCheckResult>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      return ok(await this.pluginManager.check(payload.id))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 实时状态 */
  private async getPluginStatus(payload: { id: string }): Promise<ApiResult<PluginStatus>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      return ok(await this.pluginManager.getStatus(payload.id))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 配置 Schema（Worker 插件经代理异步获取——必须 await——否则返回 Promise 无法 IPC 序列化） */
  private async getPluginSchema(payload: { id: string }): Promise<ApiResult<unknown>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      const schema = await this.pluginManager.getSchema(payload.id)
      if (schema) return ok(schema)
      // schema 为 null（Worker 未就绪/插件 api 不可用——如资源缺失）——
      // 分层自检容错：主进程静态检查（entry/资源就绪度）→ 配置页仍可开（含资源下载入口）
      const degraded = this.degradedSchema(payload.id)
      return degraded ? ok(degraded) : ok(null)
    } catch (e) {
      // Worker 代理调用失败（Worker 挂但 api 代理存在——调用 reject）——
      // 同样走分层容错——配置页可开（不因 Worker 挂而打不开）
      const degraded = this.degradedSchema(payload.id)
      if (degraded) return ok(degraded)
      return fail((e as Error).message)
    }
  }

  /** 分层容错：Worker 不可用但主进程静态检查通过/有资源依赖 → 返回 degraded 可配置信息 */
  private degradedSchema(id: string): { configurable: true; degraded: true; note: string; assetDeps: import('../core/plugin/types').AssetDep[] } | null {
    const record = this.pluginManager.getRecord(id)
    if (!record) return null
    const staticOk = this.pluginManager.staticCheck(record)
    const deps = record.manifest.assetDeps ?? record.manifest.modelDeps ?? []
    if (staticOk.ok || !staticOk.ok && deps.length > 0) {
      return {
        configurable: true,
        degraded: true,
        note: staticOk.reason ?? '插件未就绪（Worker 不可用）——资源下载后重启生效',
        assetDeps: deps,
      }
    }
    return null
  }

  /** 读取配置（secret 脱敏——Worker 插件异步获取） */
  private async getPluginConfig(payload: { id: string }): Promise<ApiResult<Record<string, unknown>>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      return ok(await this.pluginManager.getConfig(payload.id))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 保存配置 */
  private async savePluginConfig(payload: { id: string; patch: Record<string, unknown> }): Promise<ApiResult<boolean>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      await this.pluginManager.saveConfig(payload.id, payload.patch ?? {})
      return ok(true)
    } catch (e) {
      return fail((e as Error).message)
    }
  }
}
