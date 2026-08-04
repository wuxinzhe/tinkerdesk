/**
 * search-files.ts — 客户端工具
 *
 * 一比一复刻 Hermes search_tool + file_operations.search：
 * - 参数：pattern/target/path/file_glob/limit/offset/output_mode/context
 * - 分页归一化（offset max(0,int) 兜底 0；limit clamp [1,2000] 兜底 50）
 * - content：rg --line-number --no-heading --with-filename [-C ctx] [--glob] pattern path
 * - files：rg --files --sortr=modified（按修改时间排序）
 * - 解析兼容 Windows 盘符（path:line:content / path-line-content）
 * - 匹配内容脱敏（redact.ts）+ 路径不存在提示相似路径
 * - 重复搜索阻断：同参数连续 ≥3 次 _warning、≥4 次 BLOCKED
 * - 返回 JSON 字符串（对齐 SearchResult.to_dict(densify=True)）
 */
import { spawnSync } from 'child_process'
import { resolve } from 'path'
import { existsSync, statSync } from 'fs'
import { BaseTool } from '../index'
import type { ToolResult, AvailabilityResult, ToolSchema } from '../index'
import { redactSensitiveText } from '../common/redact'

import type { SearchFilesParams } from '@/defines/tools/params'
import type { SearchMatch } from '@/defines/tools/search-files-types'

// ── 常量 ──

const DEFAULT_SEARCH_OFFSET = 0
const DEFAULT_SEARCH_LIMIT = 50
const MAX_SEARCH_LIMIT = 2000
const MAX_MATCH_CONTENT = 500

// ── 重复搜索追踪 ──

const searchTracker: { lastKey: string | null; consecutive: number } = { lastKey: null, consecutive: 0 }

// ── 分页归一化（对齐 normalize_search_pagination）──

function coerceInt(value: unknown, fallback: number): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : fallback
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.trunc(n)
  }
  return fallback
}

function normalizeSearchPagination(offset: unknown, limit: unknown): [number, number] {
  const normalizedOffset = Math.max(0, coerceInt(offset, DEFAULT_SEARCH_OFFSET))
  const normalizedLimit = coerceInt(limit, DEFAULT_SEARCH_LIMIT)
  return [normalizedOffset, Math.max(1, Math.min(normalizedLimit, MAX_SEARCH_LIMIT))]
}

// ── 引擎检测 ──

function checkSearchEngine(): 'rg' | 'grep' | null {
  const rg = spawnSync('rg', ['--version'], { encoding: 'utf-8', timeout: 3000 })
  if (rg.status === 0) return 'rg'
  const grep = spawnSync('grep', ['--version'], { encoding: 'utf-8', timeout: 3000 })
  if (grep.status === 0) return 'grep'
  return null
}

// ── 输出解析 ──

/** 解析 context 行（path-line-content，最右数字分隔——对齐 Hermes _parse_search_context_line） */
function parseSearchContextLine(line: string): SearchMatch | null {
  if (!line || line === '--') return null
  const matches = [...line.matchAll(/-(\d+)-/g)]
  if (matches.length === 0) return null
  const match = matches[matches.length - 1]
  const path = line.slice(0, match.index)
  if (!path) return null
  return { path, line: parseInt(match[1], 10), content: line.slice((match.index ?? 0) + match[0].length) }
}

/** 解析 match 行（path:line:content，兼容 Windows 盘符） */
function parseMatchLine(line: string): SearchMatch | null {
  const m = /^([A-Za-z]:)?(.*?):(\d+):(.*)$/.exec(line)
  if (!m) return null
  return { path: (m[1] ?? '') + m[2], line: parseInt(m[3], 10), content: m[4] }
}

/** 路径不存在 → 相似路径提示（对齐 Hermes search 的 hint_parts） */
function pathNotFoundHint(pathStr: string): string {
  const parts = [`Path not found: ${pathStr}`]
  const parent = resolve(pathStr, '..')
  const base = pathStr.split(/[\\/]/).pop() ?? ''
  if (existsSync(parent) && base) {
    try {
      const entries = require('fs').readdirSync(parent) as string[]
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

// ── 工具类 ──

export class SearchFilesTool extends BaseTool<SearchFilesParams> {
  readonly id = 'desktop_showing_search_files'
  readonly name = '文件搜索'
  readonly description = 'Search file contents or find files by name. Ripgrep-backed, faster than shell equivalents.'
  readonly category = 'file'

  getSchema(): ToolSchema {
    return {
      type: 'function',
      function: {
        name: 'desktop_showing_search_files',
        description: this.description + " Content search (target='content'): Regex search inside files. Output modes: full matches with line numbers, file paths only, or match counts. File search (target='files'): Find files by glob pattern (e.g., '*.py', '*config*'). Results sorted by modification time.",
        parameters: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Regex pattern for content search, or glob pattern (e.g., \'*.py\') for file search'
            },
            target: {
              type: 'string',
              enum: ['content', 'files'],
              description: "'content' searches inside file contents, 'files' searches for files by name",
              default: 'content'
            },
            path: {
              type: 'string',
              description: 'Directory or file to search in (default: current working directory)',
              default: '.'
            },
            file_glob: {
              type: 'string',
              description: "Filter files by pattern in grep mode (e.g., '*.py' to only search Python files)"
            },
            limit: {
              type: 'integer',
              description: 'Maximum number of results to return (default: 50)',
              default: 50
            },
            offset: {
              type: 'integer',
              description: 'Skip first N results for pagination (default: 0)',
              default: 0
            },
            output_mode: {
              type: 'string',
              enum: ['content', 'files_only', 'count'],
              description: "Output format for grep mode: 'content' shows matching lines with line numbers, 'files_only' lists file paths, 'count' shows match counts per file",
              default: 'content'
            },
            context: {
              type: 'integer',
              description: 'Number of context lines before and after each match (grep mode only)',
              default: 0
            }
          },
          required: ['pattern']
        }
      },
      toolType: 'desktop',
      emoji: '🔍'
    }
  }

  async checkAvailability(): Promise<AvailabilityResult> {
    const engine = checkSearchEngine()
    if (!engine) return { available: false, reason: '系统中未找到 ripgrep 或 grep' }
    return { available: true }
  }

  async execute(params: SearchFilesParams): Promise<ToolResult> {
    try {
      const [offset, limit] = normalizeSearchPagination(params.offset, params.limit)
      const pattern = (params.pattern ?? '').trim()
      if (!pattern) return { ok: false, data: JSON.stringify({ error: 'pattern required' }), error: 'pattern required' }
      const target = params.target ?? 'content'
      const pathStr = params.path ?? '.'
      const fileGlob = params.fileGlob ?? params.file_glob ?? undefined
      const outputMode = params.outputMode ?? params.output_mode ?? 'content'
      const context = coerceInt(params.context, 0)

      // 重复搜索检测（对齐 Hermes：同 search_key 连续 ≥4 BLOCKED）
      const searchKey = JSON.stringify(['search', pattern, target, pathStr, fileGlob ?? '', limit, offset, outputMode, context])
      if (searchTracker.lastKey === searchKey) searchTracker.consecutive++
      else { searchTracker.lastKey = searchKey; searchTracker.consecutive = 1 }
      const count = searchTracker.consecutive
      if (count >= 4) {
        return {
          ok: false,
          data: JSON.stringify({
            error: `BLOCKED: You have run this exact search ${count} times in a row. The results have NOT changed. You already have this information. STOP re-searching and proceed with your task.`,
            pattern,
            already_searched: count
          }),
          error: 'repeated search blocked'
        }
      }

      const engine = checkSearchEngine()
      if (!engine) {
        return { ok: false, data: JSON.stringify({ error: 'Content search requires ripgrep (rg) or grep. Install ripgrep: https://github.com/BurntSushi/ripgrep#installation' }), error: 'no search engine' }
      }

      // 路径存在性（对齐 Hermes：不存在 → 相似路径提示）
      if (!existsSync(pathStr)) {
        return { ok: true, data: JSON.stringify({ error: pathNotFoundHint(pathStr), total_count: 0 }) }
      }

      let resultDict: Record<string, unknown>

      if (target === 'files') {
        resultDict = this.searchFiles(pattern, pathStr, limit, offset, engine)
      } else if (outputMode === 'files_only') {
        resultDict = this.searchFilesOnly(pattern, pathStr, fileGlob, limit, offset, engine)
      } else if (outputMode === 'count') {
        resultDict = this.searchCounts(pattern, pathStr, fileGlob, limit, offset, engine)
      } else {
        resultDict = this.searchContent(pattern, pathStr, fileGlob, limit, offset, context, engine)
      }

      // 脱敏（对齐 Hermes search_tool：匹配内容 redact file_read）
      if (Array.isArray(resultDict['matches'])) {
        for (const m of resultDict['matches'] as SearchMatch[]) {
          if (m.content) m.content = redactSensitiveText(m.content)
        }
      }

      if (count >= 3) {
        resultDict['_warning'] = `You have run this exact search ${count} times consecutively. The results have not changed. Use the information you already have.`
      }

      let resultJson = JSON.stringify(resultDict)
      if (resultDict['truncated']) {
        const nextOffset = offset + limit
        resultJson += `\n\n[Hint: Results truncated. Use offset=${nextOffset} to see more, or narrow with a more specific pattern or file_glob.]`
      }
      return { ok: true, data: resultJson }
    } catch (err: any) {
      return { ok: false, error: `搜索失败: ${err.message}` }
    }
  }

  /** target=files：rg --files --sortr=modified（按修改时间排序，rg 13+；旧版回退） */
  private searchFiles(pattern: string, pathStr: string, limit: number, offset: number, engine: string): Record<string, unknown> {
    if (engine === 'rg') {
      const globPattern = (!pattern.includes('/') && !pattern.startsWith('*')) ? `*${pattern}` : pattern
      const fetchLimit = limit + offset
      let r = spawnSync('rg', ['--files', `--sortr=modified`, '-g', globPattern, pathStr], { encoding: 'utf-8', timeout: 60000 })
      let allFiles: string[] = []
      let limitReason: string | null = null
      if (r.status === 0 || r.stdout.trim()) {
        allFiles = r.stdout.trim().split('\n').filter(Boolean)
        if (allFiles.length >= fetchLimit) limitReason = `limit=${fetchLimit}`
      }
      if (allFiles.length === 0 && !limitReason) {
        // --sortr 可能不被旧版支持 → 无排序重试
        r = spawnSync('rg', ['--files', '-g', globPattern, pathStr], { encoding: 'utf-8', timeout: 60000 })
        allFiles = r.stdout.trim().split('\n').filter(Boolean)
      }
      const page = allFiles.slice(offset, offset + limit)
      return {
        files: page,
        total_count: allFiles.length,
        ...(allFiles.length >= fetchLimit || limitReason ? { truncated: true, limit_reason: limitReason } : {})
      }
    }
    // grep 降级：find 语义（Windows cmd dir 太慢，用 node 递归）
    return this.searchFilesNode(pattern, pathStr, limit, offset)
  }

  /** find 降级：Node 递归按文件名匹配 + mtime 排序 */
  private searchFilesNode(pattern: string, root: string, limit: number, offset: number): Record<string, unknown> {
    const fs = require('fs') as typeof import('fs')
    const pathMod = require('path') as typeof import('path')
    const re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*'))
    const results: Array<{ p: string; mtime: number }> = []
    const walk = (dir: string) => {
      let entries: string[]
      try { entries = fs.readdirSync(dir) } catch { return }
      for (const e of entries) {
        if (e.startsWith('.')) continue
        const full = pathMod.join(dir, e)
        try {
          const st = fs.statSync(full)
          if (st.isDirectory()) walk(full)
          else if (re.test(e)) results.push({ p: full, mtime: st.mtimeMs })
        } catch { /* 跳过无法访问 */ }
      }
    }
    walk(root)
    results.sort((a, b) => b.mtime - a.mtime)
    const page = results.slice(offset, offset + limit).map(r => r.p)
    return { files: page, total_count: results.length, ...(results.length > offset + limit ? { truncated: true } : {}) }
  }

  /** output_mode=files_only：rg -l */
  private searchFilesOnly(pattern: string, pathStr: string, fileGlob: string | undefined, limit: number, offset: number, engine: string): Record<string, unknown> {
    const args = ['--line-number', '--no-heading', '--with-filename', '-l']
    if (fileGlob) args.push('--glob', fileGlob)
    args.push('--', pattern, pathStr)
    const r = spawnSync(engine, args, { encoding: 'utf-8', timeout: 60000 })
    const allFiles = r.stdout.trim().split('\n').filter(Boolean)
    const page = allFiles.slice(offset, offset + limit)
    return {
      files: page,
      total_count: allFiles.length,
      ...(allFiles.length > offset + limit ? { truncated: true } : {})
    }
  }

  /** output_mode=count：rg -c → counts map */
  private searchCounts(pattern: string, pathStr: string, fileGlob: string | undefined, limit: number, offset: number, engine: string): Record<string, unknown> {
    const args = ['--line-number', '--no-heading', '--with-filename', '-c']
    if (fileGlob) args.push('--glob', fileGlob)
    args.push('--', pattern, pathStr)
    const r = spawnSync(engine, args, { encoding: 'utf-8', timeout: 60000 })
    const counts: Record<string, number> = {}
    for (const line of r.stdout.trim().split('\n')) {
      if (!line.includes(':')) continue
      const parts = line.split(':')
      const num = parseInt(parts[parts.length - 1], 10)
      if (!Number.isNaN(num)) counts[parts.slice(0, -1).join(':')] = num
    }
    const keys = Object.keys(counts)
    const pageKeys = keys.slice(offset, offset + limit)
    const pageCounts: Record<string, number> = {}
    for (const k of pageKeys) pageCounts[k] = counts[k]
    return {
      counts: pageCounts,
      total_count: Object.values(counts).reduce((a, b) => a + b, 0),
      ...(keys.length > offset + limit ? { truncated: true } : {})
    }
  }

  /** output_mode=content：rg match + context 解析 + densify */
  private searchContent(pattern: string, pathStr: string, fileGlob: string | undefined, limit: number, offset: number, context: number, engine: string): Record<string, unknown> {
    const args = ['--line-number', '--no-heading', '--with-filename']
    if (context > 0) args.push('-C', String(context))
    if (fileGlob) args.push('--glob', fileGlob)
    args.push('--', pattern, pathStr)
    const r = spawnSync(engine, args, { encoding: 'utf-8', timeout: 60000 })

    if (r.status === 2 && !r.stdout.trim()) {
      return { error: `Search failed: ${r.stderr.trim() || 'Search error'}`, total_count: 0 }
    }

    const matches: SearchMatch[] = []
    for (const line of r.stdout.split('\n')) {
      if (!line || line === '--') continue
      const m = parseMatchLine(line)
      if (m) {
        // 脱敏在 densify 之前（对齐 Hermes：先脱敏 SearchResult.matches 再渲染 matches_text）
        matches.push({ path: m.path, line: m.line, content: redactSensitiveText(m.content.slice(0, MAX_MATCH_CONTENT)) })
        continue
      }
      if (context > 0) {
        const cm = parseSearchContextLine(line)
        if (cm) matches.push({ path: cm.path, line: cm.line, content: redactSensitiveText(cm.content.slice(0, MAX_MATCH_CONTENT)) })
      }
    }

    const total = matches.length
    const page = matches.slice(offset, offset + limit)
    const resultDict: Record<string, unknown> = {
      total_count: total,
      truncated: total > offset + limit
    }
    // densify（对齐 Hermes：≥5 个匹配 → path-grouped 文本块）
    if (page.length >= 5) {
      const lines: string[] = []
      let currentPath: string | null = null
      for (const m of page) {
        if (m.path !== currentPath) { lines.push(m.path); currentPath = m.path }
        lines.push(`  ${m.line}: ${m.content.replace(/\s+$/, '')}`)
      }
      resultDict['matches_format'] = 'path-grouped: each file path on its own line, followed by indented \'<line>: <content>\' rows for matches in that file'
      resultDict['matches_text'] = lines.join('\n')
    } else {
      resultDict['matches'] = page.map(m => ({ path: m.path, line: m.line, content: m.content }))
    }
    return resultDict
  }
}

/** 单例实例 */
export const searchFilesTool = new SearchFilesTool()
