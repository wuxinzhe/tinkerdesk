/**
 * utils/file-read.ts — 文件读取守卫与格式化工具
 *
 * File-read helpers:
 * - isBlockedDevicePath / hasBinaryExtension: device-path + binary-extension guards
 * - truncateToCharBudget：字符预算截断
 * - addLineNumbers：行号格式化（LINE_NUM|CONTENT）
 * 被 read-file-tool 使用。
 */

/** 设备路径守卫（Windows + Unix，纯路径检查不 I/O） */
const BLOCKED_DEVICE_PATHS = new Set([
  'NUL', 'CON', 'PRN', 'AUX',
  '/dev/zero', '/dev/random', '/dev/urandom', '/dev/full',
  '/dev/stdin', '/dev/tty', '/dev/console'
])
const BLOCKED_DEVICE_PREFIXES = ['COM', 'LPT']

/** 二进制扩展名集合（读文件时拒绝） */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.svg',
  '.pdf', '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.bin',
  '.class', '.jar', '.pyc', '.woff', '.ttf',
  '.mp3', '.mp4', '.avi', '.mkv', '.mov', '.wav', '.flac'
])

/** 单行最大长度（超长截断） */
const MAX_LINE_LENGTH = 2000

/** 设备路径检查：是设备文件 → true（读取会阻塞/无限输出） */
export function isBlockedDevicePath(p: string): boolean {
  const base = p.split(/[\\/]/).pop() ?? p
  const upper = base.toUpperCase()
  if (BLOCKED_DEVICE_PATHS.has(base) || BLOCKED_DEVICE_PATHS.has(upper)) return true
  for (const prefix of BLOCKED_DEVICE_PREFIXES) {
    if (/^\d+$/.test(upper.slice(prefix.length)) && upper.startsWith(prefix)) return true
  }
  return false
}

/** 二进制扩展名检查：是二进制文件 → 返回扩展名；文本返回 null */
export function hasBinaryExtension(p: string): string | null {
  const lower = p.toLowerCase()
  const extMatch = /\.([a-z0-9]+)$/.exec(lower)
  if (!extMatch) return null
  const ext = '.' + extMatch[1]
  return BINARY_EXTENSIONS.has(ext) ? ext : null
}

/** 字符预算截断：超预算保留完整行直到超限 */
export function truncateToCharBudget(content: string, maxChars: number): { kept: string; linesKept: number; truncated: boolean } {
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

/** 行号格式化（紧凑 gutter {i}|{line}，单行超长截断） */
export function addLineNumbers(content: string, startLine: number): string {
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
