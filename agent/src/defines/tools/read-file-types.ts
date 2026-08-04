/**
 * read-file-types.ts — read-file 工具类型定义（从 tools/desktop/read-file/ 转移）
 */

/** 重复读追踪状态（dedup + consecutive loop 检测，对齐 Hermes _read_tracker） */
export interface ReadTracker {
  lastKey: string | null
  consecutive: number
  /** key(path|offset|limit) → mtime（文件未变则跳过重复读） */
  dedup: Record<string, number>
  /** key → 连续 dedup stub 命中次数（≥2 触发 BLOCKED） */
  dedupHits: Record<string, number>
}
