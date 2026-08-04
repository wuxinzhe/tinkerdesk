/**
 * read-file.ts — 客户端工具
 *
 * 一比一复刻 Hermes read_file_tool：
 * - 分页归一化（offset max(1, int) 兜底 1；limit clamp [1,2000] 兜底 500）
 * - 守卫链：设备路径 → 二进制扩展名 → 文件不存在
 * - 行号格式 LINE_NUM|CONTENT（紧凑 gutter，单行 2000 字符截断）
 * - 字符预算 100_000：超预算 → 尾部完整行截断 + next_offset/hint
 * - 敏感信息脱敏（前缀 token / PRIVATE KEY / Authorization / JSON 字段 / JWT / DB connstring）
 * - dedup（mtime 未变 → stub 提示）+ 连续重复读 ≥3 warning / ≥4 BLOCKED
 * - 返回 JSON 字符串（对齐 Hermes ReadResult.to_dict：null/空值过滤）
 */
import { readFileSync, statSync, existsSync } from 'fs'
import { resolve } from 'path'
import { BaseTool } from '../index'
import type { ToolResult, AvailabilityResult, ToolSchema } from '../index'
import { redactSensitiveText } from '../common/redact'

import type { ReadFileParams } from '@/defines/tools/params'
import type { ReadTracker } from '@/defines/tools/read-file-types'

// ── 常量（对齐 Hermes）──

const DEFAULT_OFFSET = 1
const DEFAULT_LIMIT = 500
const MAX_LINES = 2000
const MAX_LINE_LENGTH = 2000
const MAX_READ_CHARS = 100_000
const LARGE_FILE_HINT_BYTES = 512_000

const READ_DEDUP_STATUS_MESSAGE =
  'File unchanged since last read. The content from the earlier read_file result in this conversation is still current — refer to that instead of re-reading.'

// 设备路径守卫（Windows + Unix，纯路径检查不 I/O）
const BLOCKED_DEVICE_PATHS = new Set([
  'NUL', 'CON', 'PRN', 'AUX',
  '/dev/zero', '/dev/random', '/dev/urandom', '/dev/full',
  '/dev/stdin', '/dev/tty', '/dev/console'
])
const BLOCKED_DEVICE_PREFIXES = [
  'COM', 'LPT'
]

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.svg',
  '.pdf', '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.bin',
  '.class', '.jar', '.pyc', '.woff', '.ttf',
  '.mp3', '.mp4', '.avi', '.mkv', '.mov', '.wav', '.flac'
])

// ── 分页归一化（对齐 normalize_read_pagination）──

function coerceInt(value: unknown, fallback: number): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : fallback
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.trunc(n)
  }
  return fallback
}

function normalizeReadPagination(offset: unknown, limit: unknown): [number, number] {
  const normalizedOffset = Math.max(1, coerceInt(offset, DEFAULT_OFFSET))
  const normalizedLimit = coerceInt(limit, DEFAULT_LIMIT)
  return [normalizedOffset, Math.max(1, Math.min(normalizedLimit, MAX_LINES))]
}

// ── 守卫 ──

function isBlockedDevicePath(p: string): boolean {
  const base = p.split(/[\\/]/).pop() ?? p
  const upper = base.toUpperCase()
  if (BLOCKED_DEVICE_PATHS.has(base) || BLOCKED_DEVICE_PATHS.has(upper)) return true
  for (const prefix of BLOCKED_DEVICE_PREFIXES) {
    if (/^\d+$/.test(upper.slice(prefix.length)) && upper.startsWith(prefix)) return true
  }
  return false
}

function hasBinaryExtension(p: string): string | null {
  const lower = p.toLowerCase()
  const extMatch = /\.([a-z0-9]+)$/.exec(lower)
  if (!extMatch) return null
  const ext = '.' + extMatch[1]
  return BINARY_EXTENSIONS.has(ext) ? ext : null
}

// ── 字符预算截断（对齐 _truncate_to_char_budget）──

function truncateToCharBudget(content: string, maxChars: number): { kept: string; linesKept: number; truncated: boolean } {
  if (content.length <= maxChars) {
    return { kept: content, linesKept: content ? content.split('\n').length : 0, truncated: false }
  }
  const lines = content.split('\n')
  const kept: string[] = []
  let running = 0
  for (const line of lines) {
    const addition = line.length + (kept.length > 0 ? 1 : 0)
    if (running + addition > maxChars) break
    kept.push(line)
    running += addition
  }
  if (kept.length === 0) kept.push(lines[0].slice(0, maxChars))
  return { kept: kept.join('\n'), linesKept: kept.length, truncated: true }
}

// ── 行号格式化（对齐 _add_line_numbers：紧凑 gutter {i}|{line}）──

function addLineNumbers(content: string, startLine: number): string {
  const lines = content.split('\n')
  const numbered: string[] = []
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    if (line.length > MAX_LINE_LENGTH) {
      line = line.slice(0, MAX_LINE_LENGTH) + '... [truncated]'
    }
    numbered.push(`${startLine + i}|${line}`)
  }
  return numbered.join('\n')
}

// ── 重复读追踪（dedup + consecutive loop 检测，对齐 _read_tracker）──

const readTracker: ReadTracker = { lastKey: null, consecutive: 0, dedup: {}, dedupHits: {} }

function capReadTrackerData(): void {
  const dedupKeys = Object.keys(readTracker.dedup)
  if (dedupKeys.length > 200) {
    for (const k of dedupKeys.slice(0, dedupKeys.length - 200)) delete readTracker.dedup[k]
  }
  const hitKeys = Object.keys(readTracker.dedupHits)
  if (hitKeys.length > 100) {
    for (const k of hitKeys.slice(0, hitKeys.length - 100)) delete readTracker.dedupHits[k]
  }
}

// ── 工具类 ──

export class ReadFileTool extends BaseTool<ReadFileParams> {
  readonly id = 'desktop_showing_read_file'
  readonly name = '文件读取'
  readonly description = 'Read a text file with pagination and line numbers.'
  readonly category = 'file'

  getSchema(): ToolSchema {
    return {
      type: 'function',
      function: {
        name: 'desktop_showing_read_file',
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The absolute or relative path to the file to read'
            },
            offset: {
              type: 'integer',
              description: 'Line number to start reading from, 1-indexed',
              default: 1
            },
            limit: {
              type: 'integer',
              description: 'Maximum number of lines to return',
              default: 500
            }
          },
          required: ['path']
        }
      },
      toolType: 'desktop',
      emoji: '📄'
    }
  }

  async checkAvailability(): Promise<AvailabilityResult> {
    return { available: true }
  }

  async execute(params: ReadFileParams): Promise<ToolResult> {
    try {
      const [offset, limit] = normalizeReadPagination(params.offset, params.limit)
      const pathStr = (params.path ?? '').trim()
      if (!pathStr) return { ok: false, data: JSON.stringify({ error: 'path required' }), error: 'path required' }

      const resolvedPath = resolve(pathStr)

      // 设备路径守卫
      if (isBlockedDevicePath(pathStr)) {
        return {
          ok: false,
          data: JSON.stringify({ error: `Cannot read '${pathStr}': this is a device file that would block or produce infinite output.` }),
          error: 'device path blocked'
        }
      }

      // 二进制扩展守卫
      const binaryExt = hasBinaryExtension(resolvedPath)
      if (binaryExt) {
        return {
          ok: false,
          data: JSON.stringify({ error: `Cannot read binary file '${pathStr}' (${binaryExt}). Use vision_analyze for images, or terminal to inspect binary files.` }),
          error: 'binary file blocked'
        }
      }

      // 文件不存在
      if (!existsSync(resolvedPath)) {
        return { ok: false, data: JSON.stringify({ error: `No such file: ${pathStr}` }), error: 'file not found' }
      }

      // dedup 检查：同 path+offset+limit 且 mtime 未变 → stub
      const dedupKey = `${resolvedPath}|${offset}|${limit}`
      let mtime = 0
      try { mtime = statSync(resolvedPath).mtimeMs } catch { /* stat 失败 → 走完整读 */ }
      if (readTracker.dedup[dedupKey] !== undefined && readTracker.dedup[dedupKey] === mtime && mtime !== 0) {
        const hits = (readTracker.dedupHits[dedupKey] ?? 0) + 1
        readTracker.dedupHits[dedupKey] = hits
        capReadTrackerData()
        if (hits >= 2) {
          return {
            ok: false,
            data: JSON.stringify({
              error: `BLOCKED: You have called read_file on this exact region ${hits + 1} times and the file has NOT changed. STOP calling read_file for this path — the content from your earlier read_file result in this conversation is still current. Proceed with your task using the information you already have.`,
              path: pathStr,
              already_read: hits + 1
            }),
            error: 'repeated read blocked'
          }
        }
        return {
          ok: true,
          data: JSON.stringify({
            status: 'unchanged',
            message: READ_DEDUP_STATUS_MESSAGE,
            path: pathStr,
            dedup: true,
            content_returned: false
          })
        }
      }

      // 执行读取
      let raw: string
      let fileSize = 0
      try {
        raw = readFileSync(resolvedPath, 'utf-8')
        fileSize = statSync(resolvedPath).size
      } catch (err: any) {
        return { ok: false, data: JSON.stringify({ error: `Failed to read file: ${pathStr} (${err.message})` }), error: 'read failed' }
      }

      // 行号分页
      const lines = raw.split('\n')
      // 去尾部空行（Hermes 用 splitlines() 语义）
      while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
      const totalLines = lines.length
      const endLine = offset + limit - 1
      const pageLines = lines.slice(offset - 1, endLine)
      const pageText = pageLines.join('\n')

      const resultDict: Record<string, unknown> = {
        content: pageText ? addLineNumbers(pageText, offset) : '',
        total_lines: totalLines,
        file_size: fileSize,
        truncated: totalLines > endLine
      }
      if (resultDict.truncated) {
        resultDict['hint'] = `Use offset=${endLine + 1} to continue reading (showing ${offset}-${Math.min(endLine, totalLines)} of ${totalLines} lines)`
      }

      // 字符预算截断
      let contentLen = typeof resultDict['content'] === 'string' ? (resultDict['content'] as string).length : 0
      if (contentLen > MAX_READ_CHARS) {
        const trimmed = truncateToCharBudget(resultDict['content'] as string, MAX_READ_CHARS)
        const nextOffset = offset + trimmed.linesKept
        const shownEnd = offset + trimmed.linesKept - 1
        resultDict['content'] = trimmed.kept
        resultDict['truncated'] = true
        resultDict['truncated_by'] = 'bytes'
        resultDict['next_offset'] = nextOffset
        resultDict['hint'] = `Output truncated at the ${MAX_READ_CHARS.toLocaleString('en-US')}-char read budget after ${trimmed.linesKept} line(s) (showing lines ${offset}-${shownEnd} of ${totalLines}). Use offset=${nextOffset} to continue.`
        if ((trimmed.kept.split('\n', 1)[0]).length >= MAX_READ_CHARS) {
          resultDict['hint'] += ' Note: the first line alone exceeded the budget and was clamped mid-line; its remainder is not retrievable via offset.'
        }
        contentLen = trimmed.kept.length
      }

      // 脱敏（guard 之后，避免对超大内容做昂贵正则）
      if (resultDict['content']) {
        resultDict['content'] = redactSensitiveText(resultDict['content'] as string)
      }

      // 大文件提示
      if (fileSize > LARGE_FILE_HINT_BYTES && limit > 200 && resultDict['truncated']) {
        resultDict['_hint'] = `This file is large (${fileSize.toLocaleString('en-US')} bytes). Consider reading only the section you need with offset and limit to keep context usage efficient.`
      }

      // 追踪：consecutive loop 检测 + dedup mtime 记录
      const readKey = `read|${pathStr}|${offset}|${limit}`
      readTracker.dedupHits[dedupKey] = 0
      if (readTracker.lastKey === readKey) readTracker.consecutive++
      else { readTracker.lastKey = readKey; readTracker.consecutive = 1 }
      const count = readTracker.consecutive
      if (mtime !== 0) {
        readTracker.dedup[dedupKey] = mtime
      }
      capReadTrackerData()

      if (count >= 4) {
        return {
          ok: false,
          data: JSON.stringify({
            error: `BLOCKED: You have read this exact file region ${count} times in a row. The content has NOT changed. You already have this information. STOP re-reading and proceed with your task.`,
            path: pathStr,
            already_read: count
          }),
          error: 'repeated read blocked'
        }
      }
      if (count >= 3) {
        resultDict['_warning'] = `You have read this exact file region ${count} times consecutively. The content has not changed since your last read. Use the information you already have. If you are stuck in a loop, stop reading and proceed with writing or responding.`
      }

      return { ok: true, data: JSON.stringify(resultDict) }
    } catch (err: any) {
      return { ok: false, error: `读取文件失败: ${err.message}` }
    }
  }
}

/** 单例实例 */
export const readFileTool = new ReadFileTool()
