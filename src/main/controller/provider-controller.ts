/**
 * provider-controller.ts — 扩展管理 IPC（对齐 Controller 规范：独立具名方法 + register 绑定）
 *
 * Channels:
 *   provider:list         → provider list (manifest + status)
 *   provider:toggle       → enable/disable provider { id, enabled }
 *   provider:get-status   → live status (incl. provider-custom detail)
 *   provider:get-schema   → config schema (dynamic form rendering)
 *   provider:get-config   → read config (secrets masked)
 *   provider:save-config  → save config { id, patch }
 */
import { dialog, BrowserWindow} from 'electron'
import { handleTrusted } from '../security/ipc-guard'
import {  existsSync, statSync } from 'fs'
import { join } from 'path'
import { ProviderManager } from '../core/provider/provider-manager'
import { ProviderCenter } from '../core/provider/provider-center'
import { Installer } from '../core/installer/installer'
import { getMarketProviderDetail, listMarketProviders } from '../service/provider-market-service'
import type { ProviderCheckResult, ProviderInfo, ProviderStatus, ToggleResult } from '../core/provider/types'

type ApiResult<T> = { success: true; data: T } | { success: false; error: string }

function ok<T>(data: T): ApiResult<T> {
  return { success: true, data }
}
function fail(error: string): ApiResult<never> {
  return { success: false, error }
}

export class ProviderController {
  constructor(
    private readonly providerCenter: ProviderCenter,
    private readonly providerManager: ProviderManager,
    /** 主窗口提供者（文件对话框必须关联窗口，否则不显示） */
    private readonly getWindow: () => BrowserWindow | null,
  ) {
    this.installer = providerCenter.getInstaller()
  }

  private readonly installer: Installer

  register(): void {
    handleTrusted('provider:list', () => this.listProviders())
    handleTrusted('provider:toggle', (_event, payload: { id: string; enabled: boolean }) =>
      this.toggle(payload),
    )
    handleTrusted('provider:check', (_event, payload: { id: string }) => this.check(payload))
    handleTrusted('provider:get-status', (_event, payload: { id: string }) =>
      this.getProviderStatus(payload),
    )
    handleTrusted('provider:get-schema', (_event, payload: { id: string }) =>
      this.getProviderSchema(payload),
    )
    handleTrusted('provider:pick-file', (_event, payload: { filters?: { name: string; extensions: string[] }[] }) =>
      this.pickFile(payload),
    )
    handleTrusted('provider:install', (_event, payload: { path: string }) => this.install(payload))
    handleTrusted('provider:install-npm', (_event, payload: { pkg: string; registry?: string }) => this.installFromNpm(payload))
    handleTrusted('provider:install-start', (_event, payload: { pkg?: string; path?: string; registry?: string }) => this.installStart(payload))
    handleTrusted('provider:install-step', (_event, payload: { sessionId: string; stage: string; skipAssets?: string[] }) => this.installStep(payload))
    handleTrusted('provider:install-download', (_event, payload: { sessionId: string }) => this.installDownload(payload))
    handleTrusted('provider:market-list', (_event, payload: { category?: string; search?: string } = {}) => this.marketList(payload))
    handleTrusted('provider:market-detail', (_event, payload: { name: string }) => this.marketDetail(payload))
    handleTrusted('provider:uninstall', (_event, payload: { id: string }) => this.uninstall(payload))
    handleTrusted('provider:pick-install-package', (_event, payload: { kind?: 'zip' | 'folder' }) =>
      this.pickInstallPackage(payload ?? {}),
    )
    handleTrusted('provider:get-config', (_event, payload: { id: string }) =>
      this.getProviderConfig(payload),
    )
    handleTrusted('provider:save-config', (_event, payload: { id: string; patch: Record<string, unknown> }) =>
      this.saveProviderConfig(payload),
    )
    handleTrusted('provider:download-assets', async (_event, payload: { id: string; depName?: string }) =>
      this.downloadAssets(payload),
    )
    handleTrusted('provider:asset-status', (_event, payload: { id: string }) => this.assetStatus(payload))
  }

  /** 资源就绪状态（主进程文件检查——配置页"已就绪"判定） */
  private async assetStatus(payload: { id: string }): Promise<ApiResult<Record<string, boolean>>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      return ok(this.installer.getAssetStatus(payload.id))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 主进程资源下载（不依赖 Worker——配置页下载按钮调用——depName 指定单个资源——进度经 provider:assets-progress 事件推送） */
  private async downloadAssets(payload: { id: string; depName?: string }): Promise<ApiResult<{ name: string; ok: boolean; error?: string }[]>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      const id = payload.id
      const results = await this.installer.downloadAssetsById(id, (depName, received, total) => {
        const wc = this.providerCenter.getEmitTarget()
        if (wc && !wc.isDestroyed()) {
          wc.send('provider:assets-progress', { providerId: id, depName, received, total })
        }
      }, payload.depName)
      return ok(results)
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 扩展列表 */
  private listProviders(): ApiResult<ProviderInfo[]> {
    try {
      return ok(this.providerCenter.providerList())
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 启停扩展（启用前自检：不通过返回 checks 引导修复，不改变状态） */
  private async toggle(payload: { id: string; enabled: boolean }): Promise<ApiResult<ToggleResult>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      return ok(await this.providerCenter.toggle(payload.id, !!payload.enabled))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 选择扩展安装包：按 kind 弹对应对话框（zip=文件选择器 / folder=目录选择器；分开弹——Windows 组合模式不显示文件） */
  private async pickInstallPackage(payload: { kind?: 'zip' | 'folder' }): Promise<ApiResult<string | null>> {
    try {
      const win = this.getWindow()
      if (!win) return ok(null)
      const kind = payload?.kind === 'folder' ? 'folder' : 'zip'
      const options: Electron.OpenDialogOptions = {
        title: kind === 'zip' ? '选择扩展包（.zip）' : '选择扩展文件夹',
        properties: kind === 'zip' ? ['openFile'] : ['openDirectory'],
        filters: kind === 'zip' ? [{ name: '扩展包', extensions: ['zip'] }] : undefined,
      }
      const result = await dialog.showOpenDialog(win, options)
      return ok(result.canceled ? null : (result.filePaths[0] ?? null))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 安装扩展：自动检测目录或 zip → 校验 → 复制到 plugins/ → 热加载（无需重启） */
  private async install(payload: { path: string }): Promise<ApiResult<ProviderInfo>> {
    try {
      const record = await this.providerCenter.installLocal(payload?.path ?? '')
      return ok({ manifest: record.manifest, status: (record as unknown as { status(): ProviderStatus }).status() })
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 在线安装扩展（npm 包名——npm pack 下载 → 解压 → 标准安装） */
  private async installFromNpm(payload: { pkg: string; registry?: string }): Promise<ApiResult<ProviderInfo>> {
    try {
      const record = await this.providerCenter.installFromNpmFull(payload?.pkg ?? '', payload?.registry)
      return ok({ manifest: record.manifest, status: (record as unknown as { status(): ProviderStatus }).status() })
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 分步安装：开始会话（validate 阶段——npm pack 下载或本地路径——返回 manifest 信息 + 资源清单） */
  private async installStart(payload: { pkg?: string; path?: string; registry?: string } = {}): Promise<ApiResult<unknown>> {
    try {
      const session = payload.pkg
        ? await this.installer.startNpm(payload.pkg, payload.registry ? { registry: payload.registry } : undefined)
        : this.installer.start(payload.path ?? '')
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

  /** 分步安装：执行下一步（copy/deps/assets/register——失败可重试该步——assets 下载带进度事件） */
  private async installStep(payload: { sessionId: string; stage: string; skipAssets?: string[] }): Promise<ApiResult<unknown>> {
    try {
      const stage = payload?.stage as 'copy' | 'deps' | 'assets' | 'register'
      const session = this.installer.getSession(payload?.sessionId ?? '')
      if (!session) return fail('安装会话不存在或已过期')
      if (stage === 'assets' && payload.skipAssets) {
        session.skipAssets = payload.skipAssets
      }
      const sid = payload?.sessionId ?? ''
      if (stage === 'register') {
        // 注册阶段是扩展中心职责（installer 纯安装基建——不含品类概念）
        this.providerCenter.registerInstalled(session.srcDir)
        this.installer.cleanupSession(sid)
        session.stages.register = 'done'
        return ok({ ok: true, stages: session.stages })
      }
      const r = await this.installer.step(sid, stage, (depName, received, total) => {
        // 资源下载进度（复用 provider:assets-progress 事件——安装向导监听）
        const wc = this.providerCenter.getEmitTarget()
        if (wc && !wc.isDestroyed()) {
          wc.send('provider:assets-progress', { providerId: 'install', sessionId: sid, depName, received, total })
        }
      })
      return ok({ ok: r.ok, error: r.error, stages: session.stages })
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 分步安装：下载 tarball（带进度——经 mainWindow 事件推送 renderer） */
  private async installDownload(payload: { sessionId: string }): Promise<ApiResult<unknown>> {
    try {
      const session = this.installer.getSession(payload?.sessionId ?? '')
      if (!session) return fail('安装会话不存在或已过期')
      await this.installer.downloadSession(payload?.sessionId ?? '', (received, total) => {
        // 进度事件推送（renderer 监听 provider:install-progress）
        const wc = this.providerCenter.getEmitTarget()
        if (wc && !wc.isDestroyed()) {
          wc.send('provider:install-progress', { sessionId: payload?.sessionId, received, total })
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

  /** 扩展详情（npm 包元数据 + 官方标记 + 已安装——详情页） */
  private async marketDetail(payload: { name: string }): Promise<ApiResult<import('../service/provider-market-service').MarketProviderDetail>> {
    try {
      const installedIds = this.providerCenter.providerList().map((p) => p.manifest.id)
      return ok(await getMarketProviderDetail(payload?.name ?? '', installedIds))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 扩展市场列表（service 层——真实 npm 搜索——分类/搜索词透传） */
  private async marketList(payload: { category?: string; search?: string } = {}): Promise<ApiResult<import('../service/provider-market-service').MarketListResult>> {
    try {
      const installedIds = this.providerCenter.providerList().map((p) => p.manifest.id)
      return ok(await listMarketProviders({ installedIds, category: payload.category, search: payload.search }))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 在解压目录中定位含 manifest.json 的扩展目录（根目录或一层子目录） */
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

  /** 卸载扩展（一键删除扩展及模型） */
  private uninstall(payload: { id: string }): ApiResult<void> {
    try {
      const id = payload?.id
      if (!id || !this.providerCenter.providerList().some((p) => p.manifest.id === id)) {
        return fail('扩展不存在')
      }
      this.providerCenter.uninstall(id)
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
      console.log(`[provider] pickFile 调用（win=${!!win}, filters=${JSON.stringify(filters ?? [])}）`)
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

  /** 扩展自检（不改变状态；启用按钮点击时先调） */
  private async check(payload: { id: string }): Promise<ApiResult<ProviderCheckResult>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      return ok(await this.providerCenter.checkHealth(payload.id))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 实时状态 */
  private async getProviderStatus(payload: { id: string }): Promise<ApiResult<ProviderStatus>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      return ok(await this.providerCenter.getStatus(payload.id))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 配置 Schema（Worker 扩展经代理异步获取——必须 await——否则返回 Promise 无法 IPC 序列化） */
  private async getProviderSchema(payload: { id: string }): Promise<ApiResult<unknown>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      const schema = await this.providerManager.getSchema(payload.id)
      if (schema) return ok(schema)
      // schema 为 null（Worker 未就绪/扩展 api 不可用——如资源缺失）——
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
  private degradedSchema(id: string): { configurable: true; degraded: true; note: string; assetDeps: import('../core/provider/types').AssetDep[] } | null {
    const record = this.providerCenter.getRecord(id)
    if (!record) return null
    const staticOk = this.providerCenter.staticCheck(record)
    const deps = record.manifest.assetDeps ?? record.manifest.modelDeps ?? []
    if (staticOk.ok || !staticOk.ok && deps.length > 0) {
      return {
        configurable: true,
        degraded: true,
        note: staticOk.reason ?? '扩展未就绪（Worker 不可用）——资源下载后重启生效',
        assetDeps: deps,
      }
    }
    return null
  }

  /** 读取配置（secret 脱敏——Worker 扩展异步获取） */
  private async getProviderConfig(payload: { id: string }): Promise<ApiResult<Record<string, unknown>>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      return ok(await this.providerManager.getConfig(payload.id))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 保存配置 */
  private async saveProviderConfig(payload: { id: string; patch: Record<string, unknown> }): Promise<ApiResult<boolean>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      await this.providerManager.saveConfig(payload.id, payload.patch ?? {})
      return ok(true)
    } catch (e) {
      return fail((e as Error).message)
    }
  }
}
