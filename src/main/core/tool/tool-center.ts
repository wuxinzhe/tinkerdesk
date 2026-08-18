import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { getAppUserDataPath } from '../../utils/electron-app'
import type { Installer } from '../installer/installer'
import type { ToolManager } from './tool-manager'
import { ToolSchema } from './tool-schema'
import type { ICenter } from '../center/types'

/**
 * ToolCenter —— 工具中心
 *
 * 管客户端外置工具包（tinkerdesk-tool-*）的 安装 / 加载 / 注册 / 卸载 / 可用性检查。
 * 与 ToolManager 分工：ToolCenter 管"装了什么工具"（生命周期），ToolManager 管"谁能用/怎么调"（授权/查询/执行）。
 * 安装链路复用 installer 的 npm 下载/解压/校验（与 provider 扩展同一套基建）。
 */
import type { ToolCenterDeps, ToolPackageManifest, AgentToolRegistration } from './types'
import { Uninstaller } from '../installer/uninstaller'

export class ToolCenter implements ICenter {
  private readonly toolManager: ToolManager
  private readonly installer: Installer
  private readonly uninstaller: Uninstaller
  /** 代码内置工具注册项（启动校验后注册——与安装工具统一入口） */
  private readonly builtin: AgentToolRegistration[]
  /** 外置工具安装目录（独立于 provider 扩展 plugins/） */
  readonly toolsDir: string

  constructor(deps: ToolCenterDeps) {
    this.toolManager = deps.toolManager
    this.installer = deps.installer
    this.uninstaller = new Uninstaller()
    this.builtin = deps.builtin ?? []
    this.toolsDir = join(getAppUserDataPath(), 'tools')
    mkdirSync(this.toolsDir, { recursive: true })
  }

  /** 启动：注册全部工具（两类一起）——① 代码内置 ② 外置安装扫描——每个过可用性校验只注册可用 */
  loadAll(): void {
    // ① 代码内置工具（工程 src/main/tools——逐 check 可用性，不可用不入池）
    if (this.builtin.length > 0) {
      this.toolManager.registerAll(this.builtin)
    }
    // ② 外置安装工具（文件扫描 tools/ 目录——require entry → {schema,execute} → 注册）
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

  /**
   * 加载单个工具包目录 → 注册进 ToolManager。
   * 优先：外置包实现 IAgentTool（导出 tool/default——getSchema/execute/check 方法，与内建同构）——直接注册。
   * 兼容旧格式 { schema, execute }：包装成 IAgentTool（过渡期——新包一律实现 IAgentTool）。
   */
  load(dir: string): void {
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as ToolPackageManifest
    if (!manifest.entry) throw new Error(`工具包 ${manifest.id} 缺少 entry`)
    const mod = require(join(dir, manifest.entry)) as Record<string, unknown>
    const toolName = manifest.tool?.name ?? manifest.id
    const externalTool = (mod.tool ?? mod.default) as import('./types').IAgentTool | undefined

    // ── 优先：外置包导出 IAgentTool（与内建同构——getSchema/execute/check 方法）──
    if (
      externalTool && typeof externalTool.getSchema === 'function' && typeof externalTool.execute === 'function'
    ) {
      const name = externalTool.getSchema()?.name ?? toolName
      if (!name) throw new Error(`工具包 ${manifest.id} 未声明工具名`)
      this.toolManager.register({ meta: { name }, tool: externalTool, source: 'external' })
      console.log(`[tool-center] 已注册工具 ${name}（包 ${manifest.id}）`)
      return
    }

    // ── 兼容旧格式 { schema, execute }（过渡期——新包一律实现 IAgentTool）──
    const legacy = mod as { schema?: { name?: string; description?: string; parameters?: Record<string, unknown> }; execute?: (toolCall: Record<string, unknown>) => unknown }
    if (!legacy.schema || typeof legacy.execute !== 'function') {
      throw new Error(`工具包 ${manifest.id} entry 未实现 IAgentTool（需导出 getSchema/execute）`)
    }
    const tool: import('./types').IAgentTool = {
      getSchema: () => new ToolSchema(legacy.schema!.name ?? toolName, legacy.schema!.description ?? '', legacy.schema!.parameters ?? null),
      check: () => ({ ok: true }),
      async execute(ctx) {
        try {
          const result = await legacy.execute!({ arguments: ctx.toolCall?.arguments ?? {} })
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
    this.toolManager.register({ meta: { name: toolName }, tool, source: 'external' })
    console.log(`[tool-center] 已注册工具 ${toolName}（包 ${manifest.id}，旧格式）`)
  }

  /** 可用性检查：entry 存在 + require 成功 + implement IAgentTool（或兼容旧 {schema,execute}） */
  check(id: string): { ok: boolean; reason?: string } {
    const dir = join(this.toolsDir, id)
    if (!existsSync(join(dir, 'manifest.json'))) return { ok: false, reason: '未安装' }
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as ToolPackageManifest
      if (!manifest.entry || !existsSync(join(dir, manifest.entry))) return { ok: false, reason: '入口文件缺失' }
      const mod = require(join(dir, manifest.entry)) as Record<string, unknown>
      const externalTool = (mod.tool ?? mod.default) as import('./types').IAgentTool | undefined
      // 优先：实现 IAgentTool（getSchema/execute 方法）
      if (externalTool && typeof externalTool.getSchema === 'function' && typeof externalTool.execute === 'function') {
        return { ok: true }
      }
      // 兼容旧格式 { schema, execute }
      if ((mod.schema && typeof mod.execute === 'function')) {
        return { ok: true }
      }
      return { ok: false, reason: 'entry 未实现 IAgentTool（需导出 getSchema/execute）' }
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
    // 委托卸载器删目录（品类无关基建——center 不手写文件删除）
    this.uninstaller.remove(dir)
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
