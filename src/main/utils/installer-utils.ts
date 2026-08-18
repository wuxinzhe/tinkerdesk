/**
 * installer-utils.ts — 安装器通用工具（tar 定位/哈希校验/目录定位——纯函数）
 */
import { createHash } from 'crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

/** tar 命令：Windows 用 System32 自带 bsdtar（Electron PATH 的 tar 不可用）；Linux/macOS 用系统 tar */
export function tarBin(): string {
  if (process.platform === 'win32') {
    const sysRoot = process.env.SystemRoot ?? 'C:\\Windows'
    return join(sysRoot, 'System32', 'tar.exe')
  }
  return 'tar'
}

/** sha256sums.json 完整性校验（包内文件与清单一致——防篡改/损坏） */
export function verifyHashes(providerDir: string): void {
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

/** 在解压目录中定位含 manifest.json 的目录（根或一层子目录） */
export function locateManifestDir(root: string): string | null {
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

/** npm-cli 解析：打包进应用的 npm（resources/npm）优先——系统 npm 兜底（dev） */
export function resolveNpmCli(): string {
  const bundled = join(process.resourcesPath, 'npm', 'bin', 'npm-cli.js')
  if (existsSync(bundled)) return bundled
  const devNpm = join(process.cwd(), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  if (existsSync(devNpm)) return devNpm
  return 'npm'
}
