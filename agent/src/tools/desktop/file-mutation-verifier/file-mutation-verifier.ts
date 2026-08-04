/**
 * file-mutation-verifier.ts — 客户端工具
 * 文件变更对比（LCS diff）
 */
import { BaseTool } from '../index'
import type { ToolResult, AvailabilityResult, ToolSchema } from '../index'

import type { VerifyMutationParams } from '@/defines/tools/params'

// ── 模块级辅助函数 ──

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

// ── 工具类 ──

export class FileMutationVerifierTool extends BaseTool<VerifyMutationParams> {
  readonly id = 'desktop_showing_file_mutation_verifier'
  readonly name = '文件变更对比'
  readonly description = '对比前后内容差异（LCS diff）'
  readonly category = 'utility'

  getSchema(): ToolSchema {
    return {
      type: 'function',
      function: {
        name: 'desktop_showing_file_mutation_verifier',
        description: 'Compare before and after content differences using LCS diff',
        parameters: {
          type: 'object',
          properties: {
            before: {
              type: 'string',
              description: 'The original file content before mutation'
            },
            after: {
              type: 'string',
              description: 'The new file content after mutation'
            }
          },
          required: ['before', 'after']
        }
      },
      toolType: 'desktop',
      emoji: '🔬'
    }
  }

  async checkAvailability(): Promise<AvailabilityResult> {
    return { available: true }
  }

  async execute(params: VerifyMutationParams): Promise<ToolResult> {
    const { before, after } = params
    if (before === '' && after === '') return { ok: true, data: { changed: false, diff: '', added: 0, removed: 0, isBinary: false } }
    if (isBinaryContent(before) || isBinaryContent(after)) {
      return { ok: true, data: { changed: before !== after, diff: `[二进制内容 — 长度从 ${before.length} 变为 ${after.length}]`, added: 0, removed: 0, isBinary: true } }
    }
    if (before === after) return { ok: true, data: { changed: false, diff: '', added: 0, removed: 0, isBinary: false } }
    const { diff, added, removed } = computeLcsDiff(before, after)
    return { ok: true, data: { changed: true, diff, added, removed, isBinary: false } }
  }
}

/** 单例实例 */
export const fileMutationVerifierTool = new FileMutationVerifierTool()
