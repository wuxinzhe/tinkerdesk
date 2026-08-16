/**
 * plugin-installer.ts — 插件安装器（独立子系统——安装/资源下载/卸载）
 *
 * 与 PluginManager 解耦：installer 只做"文件系统操作 + 资源获取"——
 * 完成后把 Plugin 交给 manager 注册（register 回调）——
 * manager 不关心安装细节。
 *
 * 分步骤安装（向导支持）：validate → copy → deps → assets → 完成
 * 每步可独立调用（失败重试该步——不重头）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, cpSync } from 'fs'
import { basename, join } from 'path'
import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import { app } from 'electron'
import { downloadFile, execFileAsync } from '../../utils/process-utils'
import { resolveNpmCli, tarBin } from '../../utils/plugin-installer-utils'
import type { InstallerDeps, InstallSession, InstallStage, PluginRecord, PluginManifest } from './types'

/** 插件安装器（每 manager 一个实例） */
export class PluginInstaller {
  private readonly sessions = new Map<string, InstallSession>()
  private sessionSeq = 0

  constructor(private readonly deps: InstallerDeps) { }

  // ── 安装会话（分步骤） ──

  /** 开始安装会话：校验安装包 + 读 manifest（第 1 步——validate） */
  start(src: string, skipAssets: string[] = []): InstallSession {
    if (!src || !existsSync(src)) throw new Error('插件包路径不存在')
    const sessionId = `install-${Date.now()}-${++this.sessionSeq}`
    const session: InstallSession = {
      sessionId,
      srcDir: src,
      manifest: null,
      pluginDir: '',
      skipAssets,
      stages: { validate: 'pending', copy: 'pending', deps: 'pending', assets: 'pending', register: 'pending' },
    }
    this.sessions.set(sessionId, session)
    // validate：定位 manifest + 校验
    const pluginDir = this.locateSource(src)
    const manifest = this.readManifest(pluginDir)
    this.validateManifest(manifest, pluginDir)
    // 已安装校验（同 id 已注册 → 拒绝——更新走独立入口）
    if (this.deps.hasPlugin(manifest.id)) {
      throw new Error(`插件已安装: ${manifest.id}（如需更新请先卸载或使用更新入口）`)
    }
    session.pluginDir = pluginDir
    session.manifest = manifest
    session.stages.validate = 'done'
    return session
  }

  /** 执行下一步（copy/deps/assets/register——失败可重试该步） */
  async step(sessionId: string, stage: 'copy' | 'deps' | 'assets' | 'register'): Promise<{ ok: boolean; error?: string }> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`安装会话不存在: ${sessionId}`)
    if (!session.manifest) throw new Error('安装会话未完成校验')
    session.stages[stage] = 'running'
    try {
      switch (stage) {
        case 'copy':
          this.copyToPluginsDir(session)
          // npm 临时目录已复制完成——清理
          if (session.tmpDir) {
            rmSync(session.tmpDir, { recursive: true, force: true })
            session.tmpDir = undefined
          }
          break
        case 'deps':
          await this.installNpmDeps(session.pluginDir)
          break
        case 'assets':
          await this.downloadAssetsTo(session.manifest, session.pluginDir, session.skipAssets)
          break
        case 'register':
          this.deps.registerPlugin(session.srcDir)
          break
      }
      session.stages[stage] = 'done'
      return { ok: true }
    } catch (e) {
      session.stages[stage] = 'failed'
      session.error = (e as Error).message
      return { ok: false, error: session.error }
    }
  }

  /** 查询会话状态 */
  getSession(sessionId: string): InstallSession | undefined {
    return this.sessions.get(sessionId)
  }

  // ── 一次性安装（兼容——顺序执行全部阶段） ──

  /** 完整安装（validate→copy→deps→register——不含 assets——资源手动） */
  async install(src: string): Promise<PluginRecord> {
    const session = this.start(src)
    for (const stage of ['copy', 'deps', 'register'] as const) {
      const r = await this.step(session.sessionId, stage)
      if (!r.ok) throw new Error(r.error)
    }
    const plugin = this.deps.registerPlugin(session.srcDir)
    this.sessions.delete(session.sessionId)
    return plugin
  }

  /** 在线安装（npm 包名——npm pack 下载 tarball → 解压 → 走标准安装流程） */
  async installFromNpm(pkgName: string, opts?: { registry?: string }): Promise<PluginRecord> {
    const session = await this.startNpm(pkgName, opts)
    for (const stage of ['copy', 'deps', 'register'] as const) {
      const r = await this.step(session.sessionId, stage)
      if (!r.ok) throw new Error(r.error)
    }
    const plugin = this.deps.registerPlugin(session.srcDir)
    this.sessions.delete(session.sessionId)
    return plugin
  }

  /** 开始 npm 分步安装会话（npm pack 下载 tarball → start（validate）——不自动 step——供向导分步执行） */
  async startNpm(pkgName: string, opts?: { registry?: string }): Promise<InstallSession> {
    if (!/^(@[a-z0-9-]+\/)?[a-z0-9-]+([@][^/]+)?$/i.test(pkgName.trim())) {
      throw new Error(`npm 包名非法: ${pkgName}`)
    }
    const tmpDir = join(app.getPath('temp'), `tinkerdesk-npm-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    const cli = resolveNpmCli()
    const packArgs = cli === 'npm'
      ? ['pack', pkgName.trim(), '--pack-destination', tmpDir]
      : [cli, 'pack', pkgName.trim(), '--pack-destination', tmpDir]
    if (opts?.registry) packArgs.push('--registry', opts.registry)
    await execFileAsync(process.execPath, packArgs)
    const tgz = readdirSync(tmpDir).find((f) => f.endsWith('.tgz'))
    if (!tgz) throw new Error('npm pack 未产生 tarball（包不存在或网络失败）')
    const session = this.start(join(tmpDir, tgz))
    session.tmpDir = tmpDir
    return session
  }

  /** 卸载插件（删除目录——Worker 由调用方先释放） */
  uninstall(id: string): void {
    const dir = join(this.deps.pluginsDir, id)
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }

  /** 资源下载（配置页手动触发——读 manifest 勾选的 assetDeps——不依赖 Worker） */
  async downloadAssets(
    manifest: PluginManifest,
    onProgress?: (depName: string, received: number, total: number) => void,
  ): Promise<{ name: string; ok: boolean; error?: string }[]> {
    const deps = (manifest.assetDeps ?? manifest.modelDeps) ?? []
    if (deps.length === 0) throw new Error(`插件 ${manifest.id} 未声明资源依赖（assetDeps）`)
    const dir = join(this.deps.pluginsDir, manifest.id)
    const results: { name: string; ok: boolean; error?: string }[] = []
    for (const dep of deps) {
      if (dep.optional) continue
      try {
        const tmp = join(dir, `.download-${Date.now()}-${basename(dep.url)}`)
        await downloadFile(dep.url, tmp, (recv, total) => onProgress?.(dep.name, recv, total))
        const destDir = join(dir, dep.dest)
        if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
        const lower = dep.url.toLowerCase()
        if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2')) {
          await execFileAsync(tarBin(), ['-xjf', tmp, '-C', destDir])
        } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
          await execFileAsync(tarBin(), ['-xzf', tmp, '-C', destDir])
        } else if (lower.endsWith('.zip')) {
          await execFileAsync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -Path '${tmp}' -DestinationPath '${destDir}' -Force`])
        } else {
          renameSync(tmp, join(destDir, basename(dep.url)))
        }
        if (existsSync(tmp)) rmSync(tmp, { force: true })
        results.push({ name: dep.name, ok: true })
      } catch (e) {
        results.push({ name: dep.name, ok: false, error: (e as Error).message })
      }
    }
    return results
  }

  // ── 私有实现 ──

  /** 定位 manifest 所在目录（src 目录或 zip 解压——zip 走临时解压） */
  private locateSource(src: string): string {
    const stat = statSync(src)
    if (stat.isDirectory()) {
      if (!existsSync(join(src, 'manifest.json'))) throw new Error('所选目录不是有效插件（缺少 manifest.json）')
      return src
    }
    if (stat.isFile() && (src.toLowerCase().endsWith('.zip') || src.toLowerCase().endsWith('.tgz'))) {
      const tmpDir = join(app.getPath('temp'), `tinkerdesk-plugin-install-${Date.now()}`)
      mkdirSync(tmpDir, { recursive: true })
      execFileSync(tarBin(), ['-xf', src, '-C', tmpDir], { stdio: 'ignore' })
      const located = this.locateManifestDir(tmpDir)
      if (!located) {
        rmSync(tmpDir, { recursive: true, force: true })
        throw new Error('zip 内未找到 manifest.json（插件包结构无效）')
      }
      this.verifyHashes(located)
      return located
    }
    throw new Error('请选择插件文件夹或 .zip 插件包')
  }

  private readManifest(pluginDir: string): PluginManifest {
    return JSON.parse(readFileSync(join(pluginDir, 'manifest.json'), 'utf-8')) as PluginManifest
  }

  private validateManifest(manifest: PluginManifest, pluginDir: string): void {
    if (!manifest.id || !manifest.entry || !manifest.name) {
      throw new Error('manifest 缺少 id/entry/name')
    }
    if (manifest.apiVersion !== 1) {
      throw new Error(`不支持的 apiVersion: ${manifest.apiVersion}（当前支持 1）`)
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.id)) {
      throw new Error(`插件 id 非法（仅允许小写字母/数字/连字符）: ${manifest.id}`)
    }
    if (manifest.id !== pluginDir.split(/[\\/]/).pop() && !existsSync(join(pluginDir, 'manifest.json'))) {
      // 目录安装时 id 不必等于目录名（zip 解压目录可能带前缀）——仅校验合法性
    }
  }

  private copyToPluginsDir(session: InstallSession): void {
    const destDir = join(this.deps.pluginsDir, session.manifest!.id)
    if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true })
    cpSync(session.pluginDir, destDir, { recursive: true, filter: (src) => !src.includes('node_modules/.cache') })
    session.pluginDir = destDir
  }

  /** npm 依赖安装（有 dependencies 且缺 node_modules——异步——不阻塞） */
  private async installNpmDeps(pluginDir: string): Promise<void> {
    const pkgFile = join(pluginDir, 'package.json')
    if (!existsSync(pkgFile)) return
    let pkg: { dependencies?: Record<string, string> } | null = null
    try {
      pkg = JSON.parse(readFileSync(pkgFile, 'utf-8')) as { dependencies?: Record<string, string> }
    } catch {
      return
    }
    const deps = pkg?.dependencies
    if (!deps || Object.keys(deps).length === 0) return
    if (existsSync(join(pluginDir, 'node_modules'))) return
    const cli = resolveNpmCli()
    const args = cli === 'npm'
      ? ['install', '--no-audit', '--no-fund', '--no-progress', '--prefix', pluginDir]
      : [cli, 'install', '--no-audit', '--no-fund', '--no-progress', '--prefix', pluginDir]
    await new Promise<void>((resolvePromise, reject) => {
      execFileAsync(process.execPath, args).then(() => resolvePromise()).catch((e) => reject(new Error(`npm 依赖安装失败（${(e as Error).message}）——插件未加载`)))
    })
  }

  private resolveNpmCli(): string {
    const bundled = join(process.resourcesPath, 'npm', 'bin', 'npm-cli.js')
    if (existsSync(bundled)) return bundled
    const devNpm = join(process.cwd(), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (existsSync(devNpm)) return devNpm
    return 'npm'
  }

  /** 资源下载到插件目录（安装阶段——勾选的 assetDeps——跳过 skipAssets——可选依赖跳过） */
  private async downloadAssetsTo(manifest: PluginManifest, pluginDir: string, skipAssets: string[]): Promise<void> {
    const deps = (manifest.assetDeps ?? manifest.modelDeps) ?? []
    for (const dep of deps) {
      if (dep.optional) continue
      if (skipAssets.includes(dep.dest)) continue
      const destDir = join(pluginDir, dep.dest)
      if (existsSync(destDir) && readdirSync(destDir).length > 0) continue
      const tmp = join(pluginDir, `.download-${Date.now()}-${dep.url.split('/').pop()}`)
      try {
        await downloadFile(dep.url, tmp)
        if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
        const lower = dep.url.toLowerCase()
        if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2')) {
          await execFileAsync(tarBin(), ['-xjf', tmp, '-C', destDir])
        } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
          await execFileAsync(tarBin(), ['-xzf', tmp, '-C', destDir])
        } else if (lower.endsWith('.zip')) {
          await execFileAsync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -Path '${tmp}' -DestinationPath '${destDir}' -Force`])
        } else {
          rmSync(tmp, { force: true })
          const target = join(destDir, dep.url.split('/').pop() ?? 'asset')
          cpSync(tmp, target)
          rmSync(tmp, { force: true })
        }
      } catch (e) {
        throw new Error(`资源下载失败 ${dep.name}: ${(e as Error).message}`)
      }
    }
  }

  /** 在解压目录中定位含 manifest.json 的目录（根或一层子目录） */
  private locateManifestDir(root: string): string | null {
    if (existsSync(join(root, 'manifest.json'))) return root
    for (const name of readdirSync(root)) {
      const sub = join(root, name)
      try {
        if (statSync(sub).isDirectory() && existsSync(join(sub, 'manifest.json'))) return sub
      } catch {
        // 跳过无效项
      }
    }
    return null
  }

  /** sha256sums.json 完整性校验（分发 zip） */
  private verifyHashes(pluginDir: string): void {
    const sumsFile = join(pluginDir, 'sha256sums.json')
    if (!existsSync(sumsFile)) return
    const sums = JSON.parse(readFileSync(sumsFile, 'utf-8')) as Record<string, string>
    for (const [rel, expected] of Object.entries(sums)) {
      const file = join(pluginDir, rel)
      if (!existsSync(file)) throw new Error(`校验失败: ${rel} 缺失`)
      const actual = createHash('sha256').update(readFileSync(file)).digest('hex')
      if (actual.toLowerCase() !== String(expected).toLowerCase()) {
        throw new Error(`插件文件哈希不匹配（可能被篡改或传输损坏）: ${rel}`)
      }
    }
  }
}
