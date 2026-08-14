/**
 * desktop/search-files-tool.ts — 文件搜索工具
 *
 * tools/desktop/search-files：
 * - 参数：pattern/target/path/file_glob/limit/offset/output_mode/context
 * - content：rg --line-number --no-heading --with-filename [-C ctx] [--glob] pattern path
 * - files：rg --files --sortr=modified（按修改时间排序）
 * - 匹配内容脱敏 + 路径不存在提示相似路径
 * - 重复搜索阻断：连续 ≥3 次 _warning、≥4 次 BLOCKED
 */
import { spawnSync } from 'child_process'
import {  join } from 'path'
import { existsSync, readdirSync, statSync } from 'fs'
import { BaseTool } from '../base-tool'
import { redactSensitiveText } from '../../utils/redact'
import { ToolResult } from '../../core/tool/tool-result'
import type { PromptRenderer } from '../../core/prompt/renderer'
import type { ToolContext } from '../../core/loop/types'
import type { SearchFilesParams } from './types'
import { coerceInt, normalizeSearchPagination } from '../../utils/number'
import { checkSearchEngine, parseMatchLine, parseSearchContextLine, pathNotFoundHint } from '../../utils/search-parse'
import type { SearchMatch } from '../../utils/types'

/** 工具名 */
export const TOOL_NAME = 'desktop_tinker_search_files'

// ── 常量 ──

const MAX_MATCH_CONTENT = 500

// ── 重复搜索追踪 ──

const searchTracker: { lastKey: string | null; consecutive: number } = { lastKey: null, consecutive: 0 }

export class SearchFilesTool extends BaseTool {
  constructor(renderer: PromptRenderer) {
    super(renderer, TOOL_NAME)
  }

  check(): boolean {
    const engine = checkSearchEngine()
    return engine !== null
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const params = (ctx.toolCall.arguments ?? {}) as unknown as SearchFilesParams
    try {
      const [offset, limit] = normalizeSearchPagination(params.offset, params.limit)
      const pattern = (params.pattern ?? '').trim()
      if (!pattern) return ToolResult.sync(JSON.stringify({ error: 'pattern required' }))
      const target = params.target ?? 'content'
      const pathStr = params.path ?? '.'
      const fileGlob = params.fileGlob ?? params.file_glob ?? undefined
      const outputMode = params.outputMode ?? params.output_mode ?? 'content'
      const context = coerceInt(params.context, 0)

      // 重复搜索检测
      const searchKey = JSON.stringify(['search', pattern, target, pathStr, fileGlob ?? '', limit, offset, outputMode, context])
      if (searchTracker.lastKey === searchKey) searchTracker.consecutive++
      else { searchTracker.lastKey = searchKey; searchTracker.consecutive = 1 }
      const count = searchTracker.consecutive
      if (count >= 4) {
        return ToolResult.sync(JSON.stringify({
          error: `BLOCKED: You have run this exact search ${count} times in a row. The results have NOT changed. You already have this information. STOP re-searching and proceed with your task.`,
          pattern,
          already_searched: count
        }))
      }

      const engine = checkSearchEngine()
      if (!engine) {
        return ToolResult.sync(JSON.stringify({ error: 'Content search requires ripgrep (rg) or grep. Install ripgrep: https://github.com/BurntSushi/ripgrep#installation' }))
      }

      // 路径存在性
      if (!existsSync(pathStr)) {
        return ToolResult.sync(JSON.stringify({ error: pathNotFoundHint(pathStr), total_count: 0 }))
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

      // 脱敏
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
      return ToolResult.sync(resultJson)
    } catch (err) {
      return ToolResult.sync(JSON.stringify({ error: `搜索失败: ${(err as Error).message}` }))
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
    // grep 降级：find 语义（Node 递归）
    return this.searchFilesNode(pattern, pathStr, limit, offset)
  }

  /** find 降级：Node 递归按文件名匹配 + mtime 排序 */
  private searchFilesNode(pattern: string, root: string, limit: number, offset: number): Record<string, unknown> {
    const re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*'))
    const results: Array<{ p: string; mtime: number }> = []
    const walk = (dir: string) => {
      let entries: string[]
      try { entries = readdirSync(dir) } catch { return }
      for (const e of entries) {
        if (e.startsWith('.')) continue
        const full = join(dir, e)
        try {
          const st = statSync(full)
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
        // 脱敏在 densify 之前
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
    // densify
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
