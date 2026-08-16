/**
 * plugin-assets.ts — 插件资源下载器（assetDeps/modelDeps——主进程侧——不依赖 Worker）
 *
 * 读 manifest.assetDeps → 下载 URL → 解压（tar.bz2/tar.gz/zip）→ 就位到 dest。
 * 下载/解压全异步（不阻塞主进程——下载期间 Agent 对话照常）。
 * 可选依赖（optional）跳过——外部引擎自带/用户自管。
 */
import { existsSync, mkdirSync, renameSync, rmSync } from 'fs'
import { basename, join } from 'path'
import { downloadFile, execFileAsync } from '../../utils/process-utils'
import { tarBin } from '../../utils/plugin-installer-utils'
import type { PluginManifest } from './types'

/** 插件资源下载器（每 manager 一个实例——构造注入插件目录） */
export class PluginAssets {
  constructor(private readonly pluginsDir: string) { }

  /** 下载并解压插件的资源依赖（返回每项结果——失败不中断其他项） */
  async download(
    manifest: PluginManifest,
    onProgress?: (depName: string, received: number, total: number) => void,
  ): Promise<{ name: string; ok: boolean; error?: string }[]> {
    const deps = (manifest.assetDeps ?? manifest.modelDeps) ?? []
    if (deps.length === 0) throw new Error(`插件 ${manifest.id} 未声明资源依赖（assetDeps）`)
    const dir = join(this.pluginsDir, manifest.id)
    const results: { name: string; ok: boolean; error?: string }[] = []
    for (const dep of deps) {
      // 可选依赖不下载（外部引擎自带/用户自管）
      if (dep.optional) continue
      try {
        const tmp = join(dir, `.download-${Date.now()}-${basename(dep.url)}`)
        await downloadFile(dep.url, tmp, (recv, total) => onProgress?.(dep.name, recv, total))
        const destDir = join(dir, dep.dest)
        if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
        // 按扩展名解压（tar.bz2 / tar.gz / zip / 裸文件）——全异步（不阻塞主进程）
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
        // 清理临时文件（解压分支）
        if (existsSync(tmp)) rmSync(tmp, { force: true })
        results.push({ name: dep.name, ok: true })
      } catch (e) {
        results.push({ name: dep.name, ok: false, error: (e as Error).message })
      }
    }
    return results
  }
}
