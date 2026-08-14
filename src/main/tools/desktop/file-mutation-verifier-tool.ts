/**
 * desktop/file-mutation-verifier-tool.ts — 文件变更对比工具
 *
 * tools/desktop/file-mutation-verifier（LCS diff）：
 * - 空/相同 → changed:false
 * - 二进制内容 → 摘要
 * - 否则 LCS diff + added/removed 计数
 */
import { BaseTool } from '../base-tool'
import { ToolResult } from '../../core/tool/tool-result'
import type { PromptRenderer } from '../../core/prompt/renderer'
import type { ToolContext } from '../../core/loop/types'
import type { VerifyMutationParams } from './types'

/** 工具名 */
export const TOOL_NAME = 'desktop_tinker_file_mutation_verifier'

function isBinaryContent(content: string): boolean {
  const sample = content.slice(0, 8192)
  let nonPrintable = 0
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i)
    if (code === 0) return true
    if (code < 8 || (code > 13 && code < 32)) nonPrintable++
  }
  return nonPrintable > sample.length * 0.3
}

function computeLcsDiff(oldStr: string, newStr: string): { diff: string; added: number; removed: number } {
  const oldLines = oldStr.split('\n'), newLines = newStr.split('\n')
  const m = oldLines.length, n = newLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = oldLines[i - 1] === newLines[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  const stack: string[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) { stack.push(' ' + oldLines[i - 1]); i--; j-- }
    else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) { stack.push('+' + newLines[j - 1]); j-- }
    else { stack.push('-' + oldLines[i - 1]); i-- }
  }
  const diff = stack.reverse().join('\n')
  let added = 0, removed = 0
  for (const line of stack) { if (line.startsWith('+')) added++; else if (line.startsWith('-')) removed++ }
  return { diff, added, removed }
}

/** 文件变更对比工具 */
export class FileMutationVerifierTool extends BaseTool {
  constructor(renderer: PromptRenderer) {
    super(renderer, TOOL_NAME)
  }

  check(): boolean {
    return true
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const params = (ctx.toolCall.arguments ?? {}) as unknown as VerifyMutationParams
    const { before, after } = params
    if (before === '' && after === '') return ToolResult.sync(JSON.stringify({ changed: false, diff: '', added: 0, removed: 0, isBinary: false }))
    if (isBinaryContent(before) || isBinaryContent(after)) {
      return ToolResult.sync(JSON.stringify({ changed: before !== after, diff: `[二进制内容 — 长度从 ${before.length} 变为 ${after.length}]`, added: 0, removed: 0, isBinary: true }))
    }
    if (before === after) return ToolResult.sync(JSON.stringify({ changed: false, diff: '', added: 0, removed: 0, isBinary: false }))
    const { diff, added, removed } = computeLcsDiff(before, after)
    return ToolResult.sync(JSON.stringify({ changed: true, diff, added, removed, isBinary: false }))
  }
}
