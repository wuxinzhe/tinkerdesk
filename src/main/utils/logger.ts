/**
 * utils/logger.ts — 本地端日志文件系统
 *
 * -spring.xml：
 *   - FILE       → tinkerdesk.{yyyy-MM-dd}.log        （按天滚动，保留 30 天）
 *   - ERROR_FILE → error.{yyyy-MM-dd}.log             （warn/error 双写，保留 30 天）
 *   - CONSOLE    → 控制台原样输出（console.* 拦截后转发）
 *
 * 用法：main 入口（index.ts）最顶部调用 initLogger()；
 *       之后所有 console.log/warn/error 自动落盘 + 控制台双写。
 */
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

let logDir = ''
let currentDate = ''
let currentFile: fs.WriteStream | null = null
let errorFile: fs.WriteStream | null = null

/** 日志保留天数 */
const MAX_HISTORY_DAYS = 30

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function timeKey(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

function safeStringify(v: unknown): string {
  if (v instanceof Error) return v.stack ?? v.message
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/** 确保当天文件流（跨天自动切换） */
function ensureStreams(): void {
  const key = dateKey(new Date())
  if (key === currentDate) return
  currentDate = key
  currentFile?.end()
  errorFile?.end()
  currentFile = fs.createWriteStream(path.join(logDir, `tinkerdesk.${key}.log`), { flags: 'a' })
  errorFile = fs.createWriteStream(path.join(logDir, `error.${key}.log`), { flags: 'a' })
}

function write(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', args: unknown[]): void {
  if (!logDir) return
  ensureStreams()
  const line = `[${timeKey(new Date())}] [${level}] ${args.map(safeStringify).join(' ')}`
  currentFile?.write(line + '\n')
  if (level === 'WARN' || level === 'ERROR') {
    errorFile?.write(line + '\n')
  }
}

/** 清理超过保留期的按天日志文件 */
function cleanupOldLogs(): void {
  const cutoff = Date.now() - MAX_HISTORY_DAYS * 86_400_000
  for (const f of fs.readdirSync(logDir)) {
    const m = f.match(/(\d{4}-\d{2}-\d{2})\.log$/)
    if (!m) continue
    const day = new Date(m[1])
    if (Number.isNaN(day.getTime())) continue
    if (day.getTime() < cutoff) {
      fs.rmSync(path.join(logDir, f), { force: true })
    }
  }
}

/** 初始化：建 logs 目录 + 拦截 console → 文件双写。必须在 main 入口最顶部调用。 */
export function initLogger(): void {
  logDir = path.join(app.getPath('userData'), 'logs')
  fs.mkdirSync(logDir, { recursive: true })
  cleanupOldLogs()
  console.log(`[logger] 日志目录: ${logDir}（按天滚动，保留 ${MAX_HISTORY_DAYS} 天）`)

  const orig = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
  }
  console.log = (...args: unknown[]) => { orig.log(...args); write('INFO', args) }
  console.warn = (...args: unknown[]) => { orig.warn(...args); write('WARN', args) }
  console.error = (...args: unknown[]) => { orig.error(...args); write('ERROR', args) }
  console.info = (...args: unknown[]) => { orig.info(...args); write('INFO', args) }
  console.debug = (...args: unknown[]) => { orig.debug(...args); write('DEBUG', args) }
}
