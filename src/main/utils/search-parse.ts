/**
 * utils/search-parse.ts — 搜索输出解析与提示工具
 *
 * 复刻 tinker-agent-ui tools/desktop/search-files：
 * - checkSearchEngine：检测 rg / grep 引擎
 * - parseMatchLine / parseSearchContextLine：输出行解析
 * - pathNotFoundHint：路径不存在相似路径提示
 * 被 search-files-tool 使用。
 */
import { spawnSync } from 'child_process'
import { resolve, basename } from 'path'
import { existsSync, readdirSync } from 'fs'
import type { SearchMatch } from './types'

/** 检测搜索引擎：rg → grep → null */
export function checkSearchEngine(): 'rg' | 'grep' | null {
  const rg = spawnSync('rg', ['--version'], { encoding: 'utf-8', timeout: 3000 })
  if (rg.status === 0) return 'rg'
  const grep = spawnSync('grep', ['--version'], { encoding: 'utf-8', timeout: 3000 })
  if (grep.status === 0) return 'grep'
  return null
}

/** 解析 match 行（path:line:content，兼容 Windows 盘符） */
export function parseMatchLine(line: string): SearchMatch | null {
  const m = /^([A-Za-z]:)?(.*?):(\d+):(.*)$/.exec(line)
  if (!m) return null
  return { path: (m[1] ?? '') + m[2], line: parseInt(m[3], 10), content: m[4] }
}

/** 解析 context 行 */
export function parseSearchContextLine(line: string): SearchMatch | null {
  if (!line || line === '--') return null
  const matches = [...line.matchAll(/-(\d+)-/g)]
  if (matches.length === 0) return null
  const match = matches[matches.length - 1]
  const path = line.slice(0, match.index)
  if (!path) return null
  return { path, line: parseInt(match[1], 10), content: line.slice((match.index ?? 0) + match[0].length) }
}

/** 路径不存在 → 相似路径提示 */
export function pathNotFoundHint(pathStr: string): string {
  const parts = [`Path not found: ${pathStr}`]
  const parent = resolve(pathStr, '..')
  const base = basename(pathStr)
  if (existsSync(parent) && base) {
    try {
      const entries = readdirSync(parent)
      const lowerQ = base.toLowerCase()
      const candidates = entries
        .filter(e => { const le = e.toLowerCase(); return lowerQ.includes(le) || le.includes(lowerQ) || le.startsWith(lowerQ.slice(0, 3)) })
        .slice(0, 5)
        .map(e => resolve(parent, e))
      if (candidates.length > 0) parts.push('Similar paths: ' + candidates.join(', '))
    } catch { /* 忽略目录读取失败 */ }
  }
  return parts.join('. ')
}
