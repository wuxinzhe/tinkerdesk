/**
 * patch-types.ts — patch 工具类型定义（从 tools/desktop/patch/ 转移）
 *
 * fuzzy-match + v4a-patch 的公共类型，集中管理。
 */

// ── fuzzy-match ──

/** 匹配区间 [start, end) */
export type MatchSpan = [number, number]

/** 模糊匹配结果（对齐 Hermes FuzzyMatchResult） */
export interface FuzzyResult {
  content: string
  matchCount: number
  strategy: string | null
  error: string | null
}

/** 序列比对操作码（简化 LCS 回溯，对齐 difflib.opcodes） */
export interface Opcode {
  tag: 'equal' | 'replace' | 'delete' | 'insert'
  i1: number; i2: number; j1: number; j2: number
}

// ── v4a-patch ──

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
