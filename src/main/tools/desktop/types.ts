/**
 * desktop/types.ts — 桌面工具参数类型定义
 *
 * All desktop-tool XxxParams centralized here.
 * 所有桌面工具的 XxxParams 集中管理在此文件。
 */
import type { ChildProcess } from 'child_process'

// ── close-terminal ──

export interface CloseTerminalParams {
  process_id: string
}

// ── file-mutation-verifier ──

export interface VerifyMutationParams {
  before: string
  after: string
}

// ── patch ──

export interface PatchParams {
  /** 模式：replace（默认）/ patch（V4A 多文件） */
  mode?: 'replace' | 'patch'
  /** 目标文件路径（replace 模式必填） */
  path?: string
  /** 查找的旧文本（replace 模式必填，模糊匹配） */
  old_string?: string
  /** 替换的新文本（replace 模式必填） */
  new_string?: string
  /** 替换所有匹配（默认 false，要求唯一） */
  replace_all?: boolean
  /** V4A patch 内容（mode=patch 时必填） */
  patch?: string
}

// ── process ──

export interface ProcessParams {
  action: 'list' | 'poll' | 'log' | 'wait' | 'kill' | 'write' | 'submit' | 'close'
  session_id?: string
  data?: string
  timeout?: number
  offset?: number
  limit?: number
}

// ── process-registry ──

export interface ProcessSession {
  /** 唯一会话 ID */
  id: string
  /** 原始命令 */
  command: string
  /** 工作目录 */
  cwd: string
  /** 操作系统 PID */
  pid: number | null
  /** 启动时间戳 */
  startTime: number
  /** 结束时间戳（null=未结束） */
  endTime: number | null
  /** 是否已结束 */
  done: boolean
  /** 退出码（null=未结束） */
  exitCode: number | null
  /** stdout 缓冲区 */
  stdout: string
  /** stderr 缓冲区 */
  stderr: string
  /** 子进程句柄（用于 stdin write / kill） */
  process: ChildProcess | null
}

export interface SpawnOptions {
  command: string
  cwd?: string
  timeout?: number
  /** Shell 方言（terminal 工具传入——cmd chcp 65001 / bash——统一 utf8） */
  shell?: string
}

// ── read-file ──

export interface ReadFileParams {
  path: string
  offset?: number
  limit?: number
}

// ── read-terminal ──

export interface ReadTerminalParams {
  session_id: string
  start_line?: number
  count?: number
}

// ── schedule-timer ──

export interface ScheduleTimerParams {
  action: 'start' | 'cancel' | 'list'
  name?: string
  duration?: number
  timerId?: string
}

// ── search-files ──

export interface SearchFilesParams {
  /** 内容搜索的正则，或文件搜索的 glob 模式（如 '*.py'） */
  pattern: string
  /** 'content' 搜索文件内容；'files' 按文件名查找 */
  target?: 'content' | 'files'
  /** 搜索目录（默认当前工作目录） */
  path?: string
  /** 内容搜索模式下按 glob 过滤文件（如 '*.py'） */
  file_glob?: string
  /** 兼容旧字段名 */
  fileGlob?: string
  /** 最大返回结果数（默认 50） */
  limit?: number
  /** 跳过前 N 个结果用于分页（默认 0） */
  offset?: number
  /** 输出格式：content（默认）/ files_only / count */
  output_mode?: 'content' | 'files_only' | 'count'
  /** 兼容旧字段名 */
  outputMode?: 'content' | 'files_only' | 'count'
  /** 匹配行上下文行数（grep 模式，默认 0） */
  context?: number
}

// ── terminal ──

export interface TerminalParams {
  command: string
  /** 超时秒数（语义：秒；默认 15s，前台最大 600s） */
  timeout?: number
  /** 后台执行：立即返回 session_id，用 process 工具管理 */
  background?: boolean
  /** 工作目录（默认进程 cwd） */
  workdir?: string
  /** PTY 模式（桌面客户端不支持，忽略） */
  pty?: boolean
  /** 后台完成通知（与 watch_patterns 互斥） */
  notify_on_complete?: boolean
  /** 后台输出监视模式（与 notify_on_complete 互斥） */
  watch_patterns?: string[]
  /** Shell 方言（'auto' 默认——探测可用 shell；显式 cmd/bash/powershell） */
  shell?: string
}

// ── web-extract ──

/** URL 字符串或含 url/href 字段的对象 */
export type WebExtractUrlItem = string | { url?: string; href?: string }

export interface WebExtractParams {
  urls: WebExtractUrlItem[]
  /** 输出格式（markdown/html，可选） */
  format?: string
  /** 每页字符预算（默认 15000），超限 head+tail 截断 */
  char_limit?: number
}

// ── web-search ──

export interface WebSearchParams {
  query: string
  /** 返回结果数量（1-100），默认 5 */
  limit?: number
}

// ── write-file ──

export interface WriteFileParams {
  /** 写入路径（绝对或相对，相对基于 cwd） */
  path: string
  content: string
}

// ── patch（fuzzy-match + v4a-patch 公共类型，原 patch-types.ts） ──

/** 匹配区间 [start, end) */
export type MatchSpan = [number, number]
/** 模糊匹配结果 */
export interface FuzzyResult {
  content: string
  matchCount: number
  strategy: string | null
  error: string | null
}

/** 序列比对操作码 */
export interface Opcode {
  tag: 'equal' | 'replace' | 'delete' | 'insert'
  i1: number; i2: number; j1: number; j2: number
}

/** V4A 操作类型 */
export type OperationType = 'UPDATE' | 'ADD' | 'DELETE' | 'MOVE'

/** Hunk 行（前缀 + 内容） */
export interface HunkLine {
  prefix: '+' | '-' | ' '
  content: string
}

/** Hunk：context hint + 行列表 */
export interface Hunk {
  contextHint: string | null
  lines: HunkLine[]
}

/** V4A 操作：对单个文件的一组 hunks */
export interface PatchOperation {
  operation: OperationType
  filePath: string
  newPath?: string
  hunks: Hunk[]
}

/** V4A 应用结果 */
export interface PatchApplyResult {
  success: boolean
  diff: string
  filesModified: string[]
  filesCreated: string[]
  filesDeleted: string[]
  error?: string
}

// ── search-files（原 search-files-types.ts） ──

/** 搜索匹配项（path + 行号 + 内容） */
export interface SearchMatch {
  path: string
  line: number
  content: string
}

// ── web-search / web-extract provider 接口已迁移到 providers/search|extract/types（2026-08 拆包） ──
// 类型入口：src/main/providers/index.ts（SearchProvider/ExtractProvider/WebSearchResponseData/ExtractResultItem）

/** execute() 调试日志数据结构（严格类型，替代 Record<string, unknown>） */
export interface DebugCallData {
  parameters: { urls: WebExtractUrlItem[] | string; format?: string; char_limit?: number }
  error: string | null
  pages_extracted: number
  pages_truncated: number
  original_response_size: number
  final_response_size: number
  truncation_metrics: { url: string; original_size: number; sent_size: number }[]
  processing_applied: string[]
}

// ── schedule-timer（原 schedule-timer-types.ts） ──

/** 定时器记录 */
export interface TimerRecord {
  id: string
  name: string
  duration: number
  startTime: number
  timeout: NodeJS.Timeout
  remaining: number
  elapsed: boolean
}
