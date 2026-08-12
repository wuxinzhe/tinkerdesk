/**
 * plugin-controller.ts — 插件管理 IPC（对齐 Controller 规范：独立具名方法 + register 绑定）
 *
 * 频道：
 *   plugin:list         → 插件列表（manifest + 状态）
 *   plugin:toggle       → 启停插件 { id, enabled }
 *   plugin:get-status   → 实时状态（含插件自定义 detail）
 *   plugin:get-schema   → 配置 Schema（动态表单渲染）
 *   plugin:get-config   → 读取配置（secret 脱敏）
 *   plugin:save-config  → 保存配置 { id, patch }
 */
import { dialog, BrowserWindow} from 'electron'
import { handleTrusted } from '../security/ipc-guard'
import {  existsSync, statSync } from 'fs'
import { join } from 'path'
import { PluginManager } from '../core/plugin/plugin-manager'
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
      const info = this.pluginManager.installFromPath(payload?.path ?? '')
      return ok(info)
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
      return ok(await this.pluginManager.getSchema(payload.id))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 读取配置（secret 脱敏） */
  private getPluginConfig(payload: { id: string }): ApiResult<Record<string, unknown>> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      return ok(this.pluginManager.getConfig(payload.id))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 保存配置 */
  private savePluginConfig(payload: { id: string; patch: Record<string, unknown> }): ApiResult<boolean> {
    try {
      if (!payload?.id) return fail('id 不能为空')
      this.pluginManager.saveConfig(payload.id, payload.patch ?? {})
      return ok(true)
    } catch (e) {
      return fail((e as Error).message)
    }
  }
}
