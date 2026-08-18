import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { execFileAsync } from '../../utils/process-utils'
import { resolveNpmCli, tarBin, locateManifestDir } from '../../utils/plugin-installer-utils'
import { getPackageTarball } from '../../repository/npm-registry-repository'
import type { ToolManager } from './tool-manager'
import type { ToolSchema } from './tool-schema'

/**
 * ToolCenter —— 工具中心
 *
 * 管客户端外置工具包（tinkerdesk-tool-*）的 安装 / 加载 / 注册 / 卸载 / 可用性检查。
 * 与 ToolManager 分工：ToolCenter 管"装了什么工具"（生命周期），ToolManager 管"谁能用/怎么调"（授权/查询/执行）。
 * 安装链路复用 plugin-installer 的 npm 下载/解压/校验（与 provider 插件同一套基建）。
 */
export interface ToolCenterDeps {
  toolManager: ToolManager
}

interface ToolPackageManifest {
  id: string
  entry?: string
  apiVersion?: number
  kind?: string
  tool?: { name?: string; displayName?: string; description?: string; categories?: string[] }
}

export class ToolCenter {
  private readonly toolManager: ToolManager
  /** 外置工具安装目录（独立于 provider 插件 plugins/） */
  readonly toolsDir: string

  constructor(deps: ToolCenterDeps) {
    this.toolManager = deps.toolManager
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

    // 包装成 IAgentTool：schema 静态 + execute 转发插件契约（{ok, output?, error?} → ToolResult）
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
   * 从 npm 安装工具包（复用 plugin-installer 的 npm 下载/解压链路）
   * 返回工具包 id（安装完成后目录名 = manifest.id）
   */
  async installFromNpm(pkgName: string, opts?: { registry?: string }): Promise<{ id: string }> {
    const registry = opts?.registry
    // 1. 拿 tarball（npm registry——镜像回退在 getPackageTarball 内）
    const { url } = await getPackageTarball(pkgName)
    // 2. 下载到临时目录
    const tmpDir = join(app.getPath('temp'), `tk-tool-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    const tgz = join(tmpDir, 'pkg.tgz')
    const packArgs = ['pack', pkgName, '--pack-destination', tmpDir]
    if (registry) packArgs.push('--registry', registry)
    await (execFileAsync as (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>)(resolveNpmCli(), packArgs)
    // 若 npm pack 未产出（某些 registry），回退直接下载 tarball
    if (!existsSync(tgz) && url) {
      const { downloadFile } = await import('../../utils/process-utils')
      await downloadFile(url, tgz)
    }
    // 3. 解压 + 定位 manifest 目录
    const extracted = join(tmpDir, 'pkg')
    mkdirSync(extracted, { recursive: true })
    await execFileAsync(tarBin(), ['-xf', tgz, '-C', extracted])
    const located = locateManifestDir(extracted)
    if (!located) throw new Error(`${pkgName} 解压后未找到 manifest.json`)
    // 4. 校验 kind:tool + 复制到 toolsDir
    const manifest = JSON.parse(readFileSync(join(located, 'manifest.json'), 'utf-8')) as ToolPackageManifest
    if (manifest.kind !== 'tool') throw new Error(`${pkgName} 不是工具包（kind 非 tool）`)
    if (!manifest.id) throw new Error(`${pkgName} manifest 缺少 id`)
    const destDir = join(this.toolsDir, manifest.id)
    if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true })
    const { cpSync } = await import('fs')
    cpSync(located, destDir, { recursive: true })
    // 5. 清理临时目录
    rmSync(tmpDir, { recursive: true, force: true })
    // 6. 加载注册
    this.load(destDir)
    return { id: manifest.id }
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
