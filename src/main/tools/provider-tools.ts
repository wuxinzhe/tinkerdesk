/**
 * provider-tools.ts — 扩展管理 Agent 工具（本地 TinkerAgent 可调）
 *
 * 设计（与用户确认）：tool schema 只讲参数用法（与其他 tool 一致）；
 * 安装/配置流程知识放在 skill `tinkerdesk-provider-install`（读 guide.md → 按步骤操作）。
 *
 * 工具：
 * - provider_install(source)     安装扩展（本地路径 或 URL 下载后安装）
 * - provider_configure(id, values?)  读取配置 schema/当前值；传 values 则保存
 * - provider_enable(id)          启用（内部走 check 自检）
 * - provider_list()              列出已安装扩展
 * - provider_uninstall(id)       卸载（删除扩展及下载的模型）
 */
import { mkdirSync, rmSync, createWriteStream } from 'fs'
import { join, basename } from 'path'
import { tmpdir } from 'os'
import { get as httpsGet } from 'https'
import { get as httpGet } from 'http'
import { BaseTool } from './base-tool'
import { ToolResult } from '../core/tool/tool-result'
import type { ProviderManager } from '../core/provider/provider-manager'
import type { PromptRenderer } from '../core/prompt/renderer'
import type { ToolContext } from '../core/loop/types'

export const PROVIDER_INSTALL_TOOL_NAME = 'desktop_tinker_provider_install'
export const PROVIDER_CONFIGURE_TOOL_NAME = 'desktop_tinker_provider_configure'
export const PROVIDER_ENABLE_TOOL_NAME = 'desktop_tinker_provider_enable'
export const PROVIDER_LIST_TOOL_NAME = 'desktop_tinker_provider_list'
export const PROVIDER_UNINSTALL_TOOL_NAME = 'desktop_tinker_provider_uninstall'

/** 下载远程文件到本地（跟随重定向，返回本地路径） */
function downloadToTemp(url: string, destDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const filename = basename(new URL(url).pathname) || 'provider.zip'
    const dest = join(destDir, filename)
    const get = url.startsWith('https:') ? httpsGet : httpGet
    const request = (targetUrl: string): void => {
      get(targetUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          request(new URL(res.headers.location, targetUrl).toString())
          return
        }
        if (!res.statusCode || res.statusCode >= 400) {
          res.resume()
          reject(new Error(`下载失败 HTTP ${res.statusCode}: ${targetUrl}`))
          return
        }
        const ws = createWriteStream(dest)
        res.pipe(ws)
        ws.on('finish', () => resolve(dest))
        ws.on('error', reject)
      }).on('error', reject)
    }
    request(url)
  })
}

/** 安装扩展（本地路径或 URL） */
export class ProviderInstallTool extends BaseTool {
  constructor(renderer: PromptRenderer, private readonly providerManager: ProviderManager) {
    super(renderer, PROVIDER_INSTALL_TOOL_NAME)
  }

  check(): boolean {
    return true
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const params = (ctx.toolCall.arguments ?? {}) as { source?: string }
    const source = (params.source ?? '').trim()
    if (!source) return ToolResult.sync(JSON.stringify({ error: 'source 必填（本地路径或下载 URL）' }))
    try {
      let srcPath = source
      if (/^https?:\/\//i.test(source)) {
        // URL → 下载到临时目录后安装
        const tmpDir = join(tmpdir(), `tinkerdesk-provider-dl-${Date.now()}`)
        mkdirSync(tmpDir, { recursive: true })
        try {
          srcPath = await downloadToTemp(source, tmpDir)
        } finally {
          // 安装完成后清理下载目录（installFromPath 会解压到自己的临时目录）
          setTimeout(() => rmSync(tmpDir, { recursive: true, force: true }), 5000)
        }
      }
      const record = await this.providerManager.getInstaller().install(srcPath)
      const info = {
        manifest: record.manifest,
        status: (record as unknown as { status(): import('../core/provider/types').ProviderStatus }).status(),
      }
      return ToolResult.sync(JSON.stringify({
        ok: true,
        provider: { id: info.manifest.id, name: info.manifest.name, version: info.manifest.version },
        status: info.status,
      }))
    } catch (e) {
      return ToolResult.sync(JSON.stringify({ error: (e as Error).message }))
    }
  }
}

/** 读取/保存扩展配置 */
export class ProviderConfigureTool extends BaseTool {
  constructor(renderer: PromptRenderer, private readonly providerManager: ProviderManager) {
    super(renderer, PROVIDER_CONFIGURE_TOOL_NAME)
  }

  check(): boolean {
    return true
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const params = (ctx.toolCall.arguments ?? {}) as { id?: string; values?: Record<string, unknown> }
    const id = (params.id ?? '').trim()
    if (!id) return ToolResult.sync(JSON.stringify({ error: 'id 必填' }))
    try {
      const record = this.providerManager.getRecord(id)
      if (!record) return ToolResult.sync(JSON.stringify({ error: `扩展不存在: ${id}` }))
      if (params.values && Object.keys(params.values).length > 0) {
        if (!record.ctx) return ToolResult.sync(JSON.stringify({ error: `扩展未初始化: ${id}` }))
        record.ctx.setConfig(params.values as never)
        return ToolResult.sync(JSON.stringify({ ok: true, saved: Object.keys(params.values) }))
      }
      const schema = this.providerManager.getSchema(id)
      const config = this.providerManager.getConfig(id)
      return ToolResult.sync(JSON.stringify({ ok: true, schema, config }))
    } catch (e) {
      return ToolResult.sync(JSON.stringify({ error: (e as Error).message }))
    }
  }
}

/** 启用扩展（内部走 check 自检） */
export class ProviderEnableTool extends BaseTool {
  constructor(renderer: PromptRenderer, private readonly providerManager: ProviderManager) {
    super(renderer, PROVIDER_ENABLE_TOOL_NAME)
  }

  check(): boolean {
    return true
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const params = (ctx.toolCall.arguments ?? {}) as { id?: string }
    const id = (params.id ?? '').trim()
    if (!id) return ToolResult.sync(JSON.stringify({ error: 'id 必填' }))
    try {
      const result = await this.providerManager.toggle(id, true)
      return ToolResult.sync(JSON.stringify(result))
    } catch (e) {
      return ToolResult.sync(JSON.stringify({ error: (e as Error).message }))
    }
  }
}

/** 列出已安装扩展 */
export class ProviderListTool extends BaseTool {
  constructor(renderer: PromptRenderer, private readonly providerManager: ProviderManager) {
    super(renderer, PROVIDER_LIST_TOOL_NAME)
  }

  check(): boolean {
    return true
  }

  async execute(_ctx: ToolContext): Promise<ToolResult> {
    const list = this.providerManager.list()
    return ToolResult.sync(
      JSON.stringify(
        list.map((p) => ({
          id: p.manifest.id,
          name: p.manifest.name,
          version: p.manifest.version,
          description: p.manifest.description,
          capabilities: p.manifest.capabilities ?? [],
          status: p.status,
        })),
      ),
    )
  }
}

/** 卸载扩展（删除扩展及下载的模型） */
export class ProviderUninstallTool extends BaseTool {
  constructor(renderer: PromptRenderer, private readonly providerManager: ProviderManager) {
    super(renderer, PROVIDER_UNINSTALL_TOOL_NAME)
  }

  check(): boolean {
    return true
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const params = (ctx.toolCall.arguments ?? {}) as { id?: string }
    const id = (params.id ?? '').trim()
    if (!id) return ToolResult.sync(JSON.stringify({ error: 'id 必填' }))
    try {
      this.providerManager.uninstallProvider(id)
      return ToolResult.sync(JSON.stringify({ ok: true, uninstalled: id }))
    } catch (e) {
      return ToolResult.sync(JSON.stringify({ error: (e as Error).message }))
    }
  }
}
