/**
 * utils/types.ts — 工具函数包类型定义
 *
 * Central types for util functions (SearchMatch / ShellExec);
 * implementation files import from this file.
 */

/** 搜索匹配项（path + 行号 + 内容） */
export interface SearchMatch {
  path: string
  line: number
  content: string
}

/** Shell 执行描述 — 用于 terminal 工具根据平台选择 shell */
export interface ShellExec {
  /** shell 可执行文件路径（如 cmd.exe, bash） */
  command: string
  /** 前缀参数（如 ['/c'], ['-c']） */
  prefix: string[]
}
