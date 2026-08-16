/**
 * plugin-installer.ts — 插件安装子域（复制/校验/npm 依赖——与 PluginManager 解耦）
 *
 * 职责：
 *   installNpmDeps — 插件有 dependencies 且无 node_modules 时自动 npm 安装
 *   resolveNpmCli  — 定位 npm-cli（打包进应用的 resources/npm 优先——系统 npm 兜底）
 *   locateManifestDir — 从 zip 解压目录/源码目录定位 manifest.json 所在层
 *   verifyHashes  — manifest.hashes 完整性校验（发布安全）
 *   tarBin        — 定位系统 tar（Windows git-bash / Unix）
 */
import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'

/** npm-cli 解析：打包进应用的 npm（resources/npm）优先——系统 npm 兜底（dev） */
export function resolveNpmCli(): string {
  const bundled = join(process.resourcesPath, 'npm', 'bin', 'npm-cli.js')
  if (existsSync(bundled)) return bundled
  const devNpm = resolve(process.cwd(), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  if (existsSync(devNpm)) return devNpm
  // 系统 npm（用户自装 Node）——返回 npm 命令
  return 'npm'
}

/** 插件依赖安装（有 dependencies 且缺 node_modules 时——npm install——
 *  异步 execFile——不阻塞主进程；失败抛错（插件不加载——缺依赖跑不起来）） */
export async function installNpmDeps(pluginDir: string): Promise<void> {
  const pkgFile = join(pluginDir, 'package.json')
  if (!existsSync(pkgFile)) return
  let pkg: { dependencies?: Record<string, string> } | null = null
  try {
    pkg = JSON.parse(readFileSync(pkgFile, 'utf-8')) as { dependencies?: Record<string, string> }
  } catch {
    return // package.json 损坏——不阻塞安装（依赖缺失由插件自身报错）
  }
  const deps = pkg?.dependencies
  if (!deps || Object.keys(deps).length === 0) return
  if (existsSync(join(pluginDir, 'node_modules'))) return // 自带依赖——跳过

  const cli = resolveNpmCli()
  const args = cli === 'npm'
    ? ['install', '--no-audit', '--no-fund', '--no-progress', '--prefix', pluginDir]
    : [cli, 'install', '--no-audit', '--no-fund', '--no-progress', '--prefix', pluginDir]
  // 用 Electron 的 node 执行 npm-cli（打包的 npm）——用户无需安装 Node.js
  await new Promise<void>((resolvePromise, reject) => {
    execFile(process.execPath, args, { timeout: 300_000 }, (err) => {
      if (err) {
        reject(new Error(`npm 依赖安装失败（${(err as Error).message}）——插件未加载`))
        return
      }
      resolvePromise()
    })
  })
}

/** 从安装包根/zip 解压目录定位 manifest.json 所在层（最多下探 2 层） */
export function locateManifestDir(root: string): string | null {
  if (existsSync(join(root, 'manifest.json'))) return root
  for (const child of readdirSync(root)) {
    const sub = join(root, child)
    if (existsSync(join(sub, 'manifest.json'))) return sub
    for (const grand of readdirSync(sub)) {
      const subsub = join(sub, grand)
      if (existsSync(join(subsub, 'manifest.json'))) return subsub
    }
  }
  return null
}

/** sha256sums.json 完整性校验（包内文件与清单一致——防篡改/损坏） */
export function verifyHashes(pluginDir: string): void {
  const sumsFile = join(pluginDir, 'sha256sums.json')
  if (!existsSync(sumsFile)) return
  const sums = JSON.parse(readFileSync(sumsFile, 'utf-8')) as Record<string, string>
  for (const [rel, expected] of Object.entries(sums)) {
    const file = join(pluginDir, rel)
    if (!existsSync(file)) throw new Error(`校验失败: ${rel} 缺失`)
    const actual = createHash('sha256').update(readFileSync(file)).digest('hex')
    if (actual !== expected) throw new Error(`校验失败: ${rel} 哈希不匹配`)
  }
}

/** tar 命令：Windows 用 System32 自带 bsdtar（Electron PATH 的 tar 不可用）；Linux/macOS 用系统 tar */
export function tarBin(): string {
  if (process.platform === 'win32') {
    const sysRoot = process.env.SystemRoot ?? 'C:\\Windows'
    return join(sysRoot, 'System32', 'tar.exe')
  }
  return 'tar'
}
