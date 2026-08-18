import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { Installer } from '../provider/installer'
import type { ToolManager } from './tool-manager'
import type { ToolSchema } from './tool-schema'
import type { ICenter } from '../center/types'

/**
 * ToolCenter —— 工具中心
 *
 * 管客户端外置工具包（tinkerdesk-tool-*）的 安装 / 加载 / 注册 / 卸载 / 可用性检查。
 * 与 ToolManager 分工：ToolCenter 管"装了什么工具"（生命周期），ToolManager 管"谁能用/怎么调"（授权/查询/执行）。
 * 安装链路复用 installer 的 npm 下载/解压/校验（与 provider 扩展同一套基建）。
 */
import type { ToolCenterDeps, ToolPackageManifest } from './types'

export class ToolCenter implements ICenter {
  private readonly toolManager: ToolManager
  private readonly installer: Installer
  /** 外置工具安装目录（独立于 provider 扩展 plugins/） */
  readonly toolsDir: string

  constructor(deps: ToolCenterDeps) {
    this.toolManager = deps.toolManager
    this.installer = deps.installer
    this.toolsDir = join(app.getPath('userData'), 'tools')
    mkdirSync(this.toolsDir, { recursive: true })
  }

  /** 启动：扫描工具目录 → 加载并注册全部已装工具（不可用跳过并记录） */
  loadAll(): void {
    if (!existsSync(this.toolsDir)) return
    for (const name of readdirSync(this.toolsDir)) {
      const dir = join(this.toolsDir, name)
      if (!existsSync(join(dir, 'manifest.json'))) continue
      try {
        this.load(dir)
      } catch (e) {
        console.error(`[tool-center] 加载工具失败 ${name}:`, (e as Error).message)
      }
    }
  }

  /** 加载单个工具包目录：require entry → { schema, execute } → 注册进 ToolManager */
  load(dir: string): void {
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as ToolPackageManifest
    if (!manifest.entry) throw new Error(`工具包 ${manifest.id} 缺少 entry`)
    const mod = require(join(dir, manifest.entry)) as { schema?: ToolSchema; execute?: (toolCall: Record<string, unknown>) => unknown }
    if (!mod.schema || typeof mod.execute !== 'function') {
      throw new Error(`工具包 ${manifest.id} entry 未导出 { schema, execute }`)
    }
    const toolName = mod.schema.name ?? manifest.tool?.name ?? manifest.id
    if (!toolName) throw new Error(`工具包 ${manifest.id} 未声明工具名`)

    // 包装成 IAgentTool：schema 静态 + execute 转发扩展契约（{ok, output?, error?} → ToolResult）
    const tool: import('./types').IAgentTool = {
      getSchema: () => mod.schema as ToolSchema,
      async execute(ctx) {
        try {
          const result = await mod.execute!({ arguments: ctx.toolCall?.arguments ?? {} })
          const r = result as { ok?: boolean; output?: string; error?: string }
          if (r?.ok === false || (r && !r.ok)) {
            return import('./tool-result').then((m) => m.ToolResult.sync(JSON.stringify({ error: r?.error ?? '工具执行失败' })))
          }
          return import('./tool-result').then((m) => m.ToolResult.sync(r?.output ?? JSON.stringify(r ?? {})))
        } catch (e) {
          return import('./tool-result').then((m) => m.ToolResult.sync(JSON.stringify({ error: (e as Error).message })))
        }
      },
    }
    this.toolManager.register({ meta: { name: toolName }, tool })
    console.log(`[tool-center] 已注册工具 ${toolName}（包 ${manifest.id}）`)
  }

  /** 可用性检查：entry 存在 + require 成功 + schema/execute 有效 */
  check(id: string): { ok: boolean; reason?: string } {
    const dir = join(this.toolsDir, id)
    if (!existsSync(join(dir, 'manifest.json'))) return { ok: false, reason: '未安装' }
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as ToolPackageManifest
      if (!manifest.entry || !existsSync(join(dir, manifest.entry))) return { ok: false, reason: '入口文件缺失' }
      const mod = require(join(dir, manifest.entry))
      if (!mod.schema || typeof mod.execute !== 'function') return { ok: false, reason: '未导出 { schema, execute }' }
      return { ok: true }
    } catch (e) {
      return { ok: false, reason: (e as Error).message }
    }
  }

  /**
     * 从 npm 安装工具包（复用分步安装器：validate → 下载解压 → copy/deps/assets + center 自己注册）
     * 返回工具包 id（安装完成后目录名 = manifest.id）
     */
    async installFromNpm(pkgName: string, opts?: { registry?: string }): Promise<{ id: string }> {
      const session = await this.installer.startNpm(pkgName, opts)
      await this.installer.downloadSession(session.sessionId)
      for (const stage of ['copy', 'deps'] as const) {
        const r = await this.installer.step(session.sessionId, stage)
        if (!r.ok) throw new Error(r.error)
      }
      // 资源可选（工具包 assetDeps——按 manifest 声明）
      const manifest = session.manifest as ToolPackageManifest | null
      if (manifest?.assetDeps?.length) {
        const r = await this.installer.step(session.sessionId, 'assets')
        if (!r.ok) throw new Error(r.error)
      }
      // 不调 register 分步（那是 provider 专属）——center 自己从 toolsDir 加载注册
      const id = manifest?.id
      if (!id) throw new Error(`${pkgName} 未返回有效 manifest id`)
      const destDir = join(this.toolsDir, id)
      this.load(destDir)
      this.installer.cleanupSession(session.sessionId)
      return { id }
    }

  /** 卸载：ToolManager 反注册 + 移除目录 */
  uninstall(id: string): void {
    const dir = join(this.toolsDir, id)
    if (!existsSync(dir)) return
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as ToolPackageManifest
      const toolName = manifest.tool?.name ?? manifest.id
      this.toolManager.unregister(toolName)
    } catch {
      // manifest 损坏——按 id 兜底反注册
      this.toolManager.unregister(id)
    }
    rmSync(dir, { recursive: true, force: true })
    console.log(`[tool-center] 已卸载工具包 ${id}`)
  }

  /** 已装工具包清单（目录名 + 可用性） */
  list(): Array<{ id: string; ok: boolean; reason?: string }> {
    if (!existsSync(this.toolsDir)) return []
    const out: Array<{ id: string; ok: boolean; reason?: string }> = []
    for (const name of readdirSync(this.toolsDir)) {
      const dir = join(this.toolsDir, name)
      if (!existsSync(join(dir, 'manifest.json'))) continue
      out.push({ id: name, ...this.check(name) })
    }
    return out
  }
}
