/**
 * installer.ts — 扩展安装器（独立子系统——安装/资源下载/卸载）
 *
 * 与 ProviderManager 解耦：installer 只做"文件系统操作 + 资源获取"——
 * 完成后把 Provider 交给 manager 注册（register 回调）——
 * manager 不关心安装细节。
 *
 * 分步骤安装（向导支持）：validate → copy → deps → assets → 完成
 * 每步可独立调用（失败重试该步——不重头）。
 */
import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import { app } from 'electron'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'fs'
import { basename, join } from 'path'
import { getPackageTarball } from '../../repository/npm-registry-repository'
import { locateManifestDir, resolveNpmCli, tarBin } from '../../utils/installer-utils'
import { downloadWithMirror, execFileAsync } from '../../utils/process-utils'
import type { InstallerDeps, InstallSession, ProviderManifest, ProviderRecord } from './types'

/** 自定义 registry 的 tarball 查询（npm view 命令——走镜像/代理） */
async function fetchTarballViaNpm(pkgName: string, registry: string): Promise<{ url: string; size?: number }> {
  const cli = resolveNpmCli()
  const args = cli === 'npm'
    ? ['view', pkgName, 'dist.tarball', '--registry', registry]
    : [cli, 'view', pkgName, 'dist.tarball', '--registry', registry]
  const out = await new Promise<string>((resolve, reject) => {
    execFileAsync(process.execPath, args).then((r) => resolve(String(r).trim())).catch((e) => reject(new Error(`npm view 失败: ${(e as Error).message}`)))
  })
  if (!out) throw new Error(`npm 包 ${pkgName} 无 tarball 地址`)
  return { url: out }
}

/** 解压归档到目标目录——若解压后只有单个子目录则提升其内容到根（whisper-bin-x64.zip → Release/；sherpa tar.bz2 → 模型名/——内容归位 dest 根，扩展按根路径检查） */
async function extractArchivePromote(tmp: string, destDir: string): Promise<void> {
  const lower = tmp.toLowerCase()
  if (lower.endsWith('.zip')) {
    await execFileAsync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -Path '${tmp}' -DestinationPath '${destDir}' -Force`])
  } else if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2')) {
    await execFileAsync(tarBin(), ['-xjf', tmp, '-C', destDir])
  } else {
    await execFileAsync(tarBin(), ['-xzf', tmp, '-C', destDir])
  }
  const entries = readdirSync(destDir).filter((n) => !n.startsWith('.'))
  if (entries.length === 1) {
    const only = join(destDir, entries[0])
    if (statSync(only).isDirectory()) {
      for (const name of readdirSync(only)) {
        renameSync(join(only, name), join(destDir, name))
      }
      rmSync(only, { recursive: true, force: true })
    }
  }
}

/** 扩展安装器（每 manager 一个实例） */
export class Installer {
  private readonly sessions = new Map<string, InstallSession>()
  private sessionSeq = 0

  constructor(private readonly deps: InstallerDeps) { }

  // ── 安装会话（分步骤） ──

  /** 开始安装会话：校验安装包 + 读 manifest（第 1 步——validate） */
  start(src: string, skipAssets: string[] = []): InstallSession {
    if (!src || !existsSync(src)) throw new Error('扩展包路径不存在')
    const sessionId = `install-${Date.now()}-${++this.sessionSeq}`
    const session: InstallSession = {
      sessionId,
      srcDir: src,
      manifest: null,
      providerDir: '',
      skipAssets,
      stages: { validate: 'pending', copy: 'pending', deps: 'pending', assets: 'pending', register: 'pending' },
    }
    this.sessions.set(sessionId, session)
    // validate：定位 manifest + 校验
    const providerDir = this.locateSource(src)
    const manifest = this.readManifest(providerDir)
    this.validateManifest(manifest, providerDir)
    // 已安装校验（同 id 已注册 → 拒绝——更新走独立入口）
    if (this.deps.hasProvider(manifest.id)) {
      throw new Error(`扩展已安装: ${manifest.id}（如需更新请先卸载或使用更新入口）`)
    }
    session.providerDir = providerDir
    session.manifest = manifest
    session.stages.validate = 'done'
    return session
  }

  /** 执行下一步（copy/deps/assets/register——失败可重试该步——assets 下载带进度回调） */
  async step(sessionId: string, stage: 'copy' | 'deps' | 'assets' | 'register', onProgress?: (depName: string, received: number, total: number) => void): Promise<{ ok: boolean; error?: string }> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`安装会话不存在: ${sessionId}`)
    if (!session.manifest) throw new Error('安装会话未完成校验')
    session.stages[stage] = 'running'
    try {
      switch (stage) {
        case 'copy':
          this.copyToInstallDir(session)
          break
        case 'deps':
          await this.installNpmDeps(session.providerDir)
          break
        case 'assets':
          // 统一走 downloadAssets（唯一实现——跳过 skipAssets 指定项）
          // 返回结果含失败项——任一失败即抛错（本步 failed——不静默继续）
          const results = await this.downloadAssets(session.manifest, onProgress, undefined, session.skipAssets)
          const failed = results.filter((r) => !r.ok)
          if (failed.length > 0) {
            throw new Error(`资源下载失败: ${failed.map((f) => `${f.name}（${f.error ?? '未知错误'}）`).join('、')}`)
          }
          break
        case 'register':
          this.deps.registerProvider(session.srcDir)
          // 注册完成——npm 临时目录不再需要——清理
          if (session.tmpDir) {
            rmSync(session.tmpDir, { recursive: true, force: true })
            session.tmpDir = undefined
          }
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

  /** 清理安装会话（center 不走 register 分步时调用——删临时目录 + 移除会话） */
  cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      if (session.tmpDir && existsSync(session.tmpDir)) {
        rmSync(session.tmpDir, { recursive: true, force: true })
      }
      this.sessions.delete(sessionId)
    }
  }

  // ── 一次性安装（兼容——顺序执行全部阶段） ──

  /** 完整安装（validate→copy→deps→register——不含 assets——资源手动） */
  async install(src: string): Promise<ProviderRecord> {
    const session = this.start(src)
    for (const stage of ['copy', 'deps'] as const) {
      const r = await this.step(session.sessionId, stage)
      if (!r.ok) throw new Error(r.error)
    }
    const provider = this.deps.registerProvider(session.srcDir)
    if (session.tmpDir) {
      rmSync(session.tmpDir, { recursive: true, force: true })
      session.tmpDir = undefined
    }
    this.sessions.delete(session.sessionId)
    return provider
  }

  /** 在线安装（npm 包名——下载 tarball → 解压 → 走标准安装流程） */
  async installFromNpm(pkgName: string, opts?: { registry?: string }): Promise<ProviderRecord> {
    const session = await this.startNpm(pkgName, opts)
    await this.downloadSession(session.sessionId)
    for (const stage of ['copy', 'deps'] as const) {
      const r = await this.step(session.sessionId, stage)
      if (!r.ok) throw new Error(r.error)
    }
    const provider = this.deps.registerProvider(session.srcDir)
    if (session.tmpDir) {
      rmSync(session.tmpDir, { recursive: true, force: true })
      session.tmpDir = undefined
    }
    this.sessions.delete(session.sessionId)
    return provider
  }

  /** 开始 npm 分步安装会话（查询 tarball URL——不下载——下载在独立 download 步骤带进度） */
  async startNpm(pkgName: string, opts?: { registry?: string }): Promise<InstallSession> {
    if (!/^(@[a-z0-9-]+\/)?[a-z0-9-]+([@][^/]+)?$/i.test(pkgName.trim())) {
      throw new Error(`npm 包名非法: ${pkgName}`)
    }
    // 查 tarball URL（registry API——走配置镜像）
    const { url, size } = opts?.registry
      ? await fetchTarballViaNpm(pkgName, opts.registry)
      : await getPackageTarball(pkgName)
    const session: InstallSession = {
      sessionId: `install-${Date.now()}-${++this.sessionSeq}`,
      srcDir: '',
      manifest: null,
      providerDir: '',
      skipAssets: [],
      stages: { validate: 'pending', copy: 'pending', deps: 'pending', assets: 'pending', register: 'pending' },
      sourceType: 'npm',
      tarballUrl: url,
      tarballSize: size,
    }
    this.sessions.set(session.sessionId, session)
    return session
  }

  /** 下载 tarball 到临时目录（带进度回调）——解压 → validate——完成会话准备 */
  async downloadSession(sessionId: string, onProgress?: (received: number, total: number) => void): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`安装会话不存在: ${sessionId}`)
    if (session.stages.validate === 'done') return
    const url = session.tarballUrl
    if (!url) throw new Error('会话无 tarball 地址')
    const tmpDir = join(app.getPath('temp'), `tinkerdesk-npm-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    const tgz = join(tmpDir, 'pkg.tgz')
    await downloadWithMirror(url, tgz, (recv, total) => onProgress?.(recv, total || (session.tarballSize ?? 0)))
    // 解压 → 定位 manifest → validate（复用 start 的校验——直接调用内部逻辑）
    const extracted = join(tmpDir, 'pkg')
    mkdirSync(extracted, { recursive: true })
    await execFileAsync(tarBin(), ['-xf', tgz, '-C', extracted])
    const located = locateManifestDir(extracted)
    if (!located) {
      rmSync(tmpDir, { recursive: true, force: true })
      throw new Error('npm 包内未找到 manifest.json（不是有效的 TinkerDesk 扩展包）')
    }
    const manifest = this.readManifest(located)
    this.validateManifest(manifest, located)
    if (this.deps.hasProvider(manifest.id)) {
      rmSync(tmpDir, { recursive: true, force: true })
      throw new Error(`扩展已安装: ${manifest.id}（如需更新请先卸载或使用更新入口）`)
    }
    session.srcDir = located
    session.providerDir = located
    session.manifest = manifest
    session.stages.validate = 'done'
    session.tmpDir = tmpDir
  }

  /** 卸载扩展（删除目录——Worker 由调用方先释放） */
  uninstall(id: string): void {
    const dir = join(this.deps.providersDir, id)
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }

  /** 读取已装扩展 manifest（安装域自包含——配置页下载/就绪检查用——不依赖 manager） */
  getManifestById(id: string): ProviderManifest {
    const file = join(this.deps.providersDir, id, 'manifest.json')
    if (!existsSync(file)) throw new Error(`扩展不存在: ${id}`)
    return JSON.parse(readFileSync(file, 'utf-8')) as ProviderManifest
  }

  /** 资源下载（按 id——读扩展目录 manifest——配置页手动触发——depName 指定单个） */
  async downloadAssetsById(
    id: string,
    onProgress?: (depName: string, received: number, total: number) => void,
    depName?: string,
  ): Promise<{ name: string; ok: boolean; error?: string }[]> {
    return this.downloadAssets(this.getManifestById(id), onProgress, depName)
  }

  /** 资源就绪状态（主进程文件检查——按 id 读 manifest——key 用资源名保证唯一——
   *  普通文件资源按具体文件存在判定（同目录多模型不互相误判）；压缩包按目录非空） */
  getAssetStatus(id: string): Record<string, boolean> {
    const manifest = this.getManifestById(id)
    const dir = join(this.deps.providersDir, id)
    const deps = manifest.assetDeps ?? manifest.modelDeps ?? []
    const status: Record<string, boolean> = {}
    for (const dep of deps) {
      const destDir = join(dir, dep.dest)
      const lower = dep.url.toLowerCase()
      const isArchive = lower.endsWith('.zip') || lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz')
      if (isArchive) {
        // 压缩包：目录非空即就绪（内容结构由解压逻辑保证）
        status[dep.name] = existsSync(destDir) && readdirSync(destDir).length > 0
      } else {
        // 普通文件：具体文件存在才就绪（同目录多资源互不影响）
        const file = basename(dep.url)
        status[dep.name] = existsSync(join(destDir, file))
      }
    }
    return status
  }

  /** 资源下载（唯一实现——配置页手动/安装阶段共用——depName 指定单个——skipNames 跳过指定——失败返回 error） */
  async downloadAssets(
    manifest: ProviderManifest,
    onProgress?: (depName: string, received: number, total: number) => void,
    depName?: string,
    skipNames: string[] = [],
  ): Promise<{ name: string; ok: boolean; error?: string }[]> {
    const deps = (manifest.assetDeps ?? manifest.modelDeps) ?? []
    if (deps.length === 0) throw new Error(`扩展 ${manifest.id} 未声明资源依赖（assetDeps）`)
    const dir = join(this.deps.providersDir, manifest.id)
    const targets = depName ? deps.filter((d) => d.name === depName) : deps.filter((d) => !skipNames.includes(d.name))
    if (targets.length === 0) throw new Error(`未找到资源: ${depName}`)
    // 并行下载（每 dep 独立——Promise.all——单个失败不影响其他——结果各自记录）
    const results = await Promise.all(
      targets.map(async (dep) => {
        // 不再按 optional 跳过：安装阶段勾选（skipNames）与配置页单点（depName）都由调用方
        // 控制选择——可选资源在勾选/指定后必须真实下载（旧逻辑全量时跳过 optional——
        // 导致安装勾选 small/medium 全被跳过只下引擎）
        try {
          // 已就绪（目标目录非空/文件存在）跳过——避免重复下载
          const destDir = join(dir, dep.dest)
          const lowerUrl = dep.url.toLowerCase()
          const isArchive = lowerUrl.endsWith('.zip') || lowerUrl.endsWith('.tar.bz2') || lowerUrl.endsWith('.tbz2') || lowerUrl.endsWith('.tar.gz') || lowerUrl.endsWith('.tgz')
          const ready = isArchive
            ? existsSync(destDir) && readdirSync(destDir).length > 0
            : existsSync(join(destDir, basename(dep.url)))
          if (ready) return { name: dep.name, ok: true }
          const tmp = join(dir, `.download-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${basename(dep.url)}`)
          await downloadWithMirror(dep.url, tmp, (recv, total) => onProgress?.(dep.name, recv, total))
          if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
          const lower = dep.url.toLowerCase()
          if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.zip')) {
            await extractArchivePromote(tmp, destDir)
          } else {
            const target = join(destDir, basename(dep.url))
            if (existsSync(target)) rmSync(target, { force: true })
            renameSync(tmp, target)
          }
          if (existsSync(tmp)) rmSync(tmp, { force: true })
          return { name: dep.name, ok: true }
        } catch (e) {
          return { name: dep.name, ok: false, error: (e as Error).message }
        }
      }),
    )
    return results
  }

  // ── 私有实现 ──

  /** 定位 manifest 所在目录（src 目录或 zip 解压——zip 走临时解压） */
  private locateSource(src: string): string {
    const stat = statSync(src)
    if (stat.isDirectory()) {
      if (!existsSync(join(src, 'manifest.json'))) throw new Error('所选目录不是有效扩展（缺少 manifest.json）')
      return src
    }
    if (stat.isFile() && (src.toLowerCase().endsWith('.zip') || src.toLowerCase().endsWith('.tgz'))) {
      const tmpDir = join(app.getPath('temp'), `tinkerdesk-provider-install-${Date.now()}`)
      mkdirSync(tmpDir, { recursive: true })
      execFileSync(tarBin(), ['-xf', src, '-C', tmpDir], { stdio: 'ignore' })
      const located = this.locateManifestDir(tmpDir)
      if (!located) {
        rmSync(tmpDir, { recursive: true, force: true })
        throw new Error('zip 内未找到 manifest.json（扩展包结构无效）')
      }
      this.verifyHashes(located)
      return located
    }
    throw new Error('请选择扩展文件夹或 .zip 扩展包')
  }

  private readManifest(providerDir: string): ProviderManifest {
    return JSON.parse(readFileSync(join(providerDir, 'manifest.json'), 'utf-8')) as ProviderManifest
  }

  private validateManifest(manifest: ProviderManifest, providerDir: string): void {
    if (!manifest.id || !manifest.entry || !manifest.name) {
      throw new Error('manifest 缺少 id/entry/name')
    }
    if (manifest.apiVersion !== 1) {
      throw new Error(`不支持的 apiVersion: ${manifest.apiVersion}（当前支持 1）`)
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.id)) {
      throw new Error(`扩展 id 非法（仅允许小写字母/数字/连字符）: ${manifest.id}`)
    }
    if (manifest.id !== providerDir.split(/[\\/]/).pop() && !existsSync(join(providerDir, 'manifest.json'))) {
      // 目录安装时 id 不必等于目录名（zip 解压目录可能带前缀）——仅校验合法性
    }
  }

  private copyToInstallDir(session: InstallSession): void {
    // kind:tool 的工具包分流到 toolsDir（外置工具独立于扩展目录——ToolCenter 加载）
    const base = session.manifest?.kind === 'tool' && this.deps.toolsDir ? this.deps.toolsDir : this.deps.providersDir
    const destDir = join(base, session.manifest!.id)
    if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true })
    cpSync(session.providerDir, destDir, { recursive: true, filter: (src) => !src.includes('node_modules/.cache') })
    session.providerDir = destDir
  }

  /** npm 依赖安装（有 dependencies 且缺 node_modules——异步——不阻塞） */
  private async installNpmDeps(providerDir: string): Promise<void> {
    const pkgFile = join(providerDir, 'package.json')
    if (!existsSync(pkgFile)) return
    let pkg: { dependencies?: Record<string, string> } | null = null
    try {
      pkg = JSON.parse(readFileSync(pkgFile, 'utf-8')) as { dependencies?: Record<string, string> }
    } catch {
      return
    }
    const deps = pkg?.dependencies
    if (!deps || Object.keys(deps).length === 0) return
    if (existsSync(join(providerDir, 'node_modules'))) return
    const cli = resolveNpmCli()
    const args = cli === 'npm'
      ? ['install', '--no-audit', '--no-fund', '--no-progress', '--prefix', providerDir]
      : [cli, 'install', '--no-audit', '--no-fund', '--no-progress', '--prefix', providerDir]
    await new Promise<void>((resolvePromise, reject) => {
      execFileAsync(process.execPath, args).then(() => resolvePromise()).catch((e) => reject(new Error(`npm 依赖安装失败（${(e as Error).message}）——扩展未加载`)))
    })
  }

  private resolveNpmCli(): string {
    const bundled = join(process.resourcesPath, 'npm', 'bin', 'npm-cli.js')
    if (existsSync(bundled)) return bundled
    const devNpm = join(process.cwd(), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (existsSync(devNpm)) return devNpm
    return 'npm'
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
  private verifyHashes(providerDir: string): void {
    const sumsFile = join(providerDir, 'sha256sums.json')
    if (!existsSync(sumsFile)) return
    const sums = JSON.parse(readFileSync(sumsFile, 'utf-8')) as Record<string, string>
    for (const [rel, expected] of Object.entries(sums)) {
      const file = join(providerDir, rel)
      if (!existsSync(file)) throw new Error(`校验失败: ${rel} 缺失`)
      const actual = createHash('sha256').update(readFileSync(file)).digest('hex')
      if (actual.toLowerCase() !== String(expected).toLowerCase()) {
        throw new Error(`扩展文件哈希不匹配（可能被篡改或传输损坏）: ${rel}`)
      }
    }
  }
}
