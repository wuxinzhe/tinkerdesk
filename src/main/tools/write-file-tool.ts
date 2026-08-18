/**
 * desktop/write-file-tool.ts — 文件写入工具
 *
 * Write-file tool:
 * - 参数 path + content
 * - 敏感系统路径守卫（Windows 版：C:\Windows\ 等）
 * - read_file 行号内容拒绝（防止把 "N|content" 显示文本写进文件）
 * - 自动创建父目录，返回 bytes_written / dirs_created / resolved_path
 */
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { Buffer } from 'buffer'
import { BaseTool } from './base-tool'
import { ToolResult } from '../core/tool/tool-result'
import { checkSensitivePath } from '../utils/path-security'
import type { PromptRenderer } from '../core/prompt/renderer'
import type { ToolContext } from '../core/loop/types'
import type { WriteFileParams } from './types'

/** 工具名 */
export const TOOL_NAME = 'desktop_tinker_write_file'

// ── read_file 行号内容拒绝──

function looksLikeReadFileLineNumberedContent(content: string): boolean {
  if (typeof content !== 'string') return false
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) return false

  const numbered: number[] = []
  for (const line of lines) {
    const stripped = line.replace(/^\s+/, '')
    const sepIdx = stripped.indexOf('|')
    const prefix = sepIdx >= 0 ? stripped.slice(0, sepIdx) : ''
    if (sepIdx >= 0 && /^\d+$/.test(prefix)) {
      numbered.push(parseInt(prefix, 10))
    }
  }
  if (numbered.length < 2) return false
  if (numbered.length / lines.length < 0.6) return false

  let consecutivePairs = 0
  for (let i = 0; i < numbered.length - 1; i++) {
    if (numbered[i + 1] === numbered[i] + 1) consecutivePairs++
  }
  return consecutivePairs >= numbered.length - 1
}

/** 文件写入工具 */
export class WriteFileTool extends BaseTool {
  constructor(renderer: PromptRenderer) {
    super(renderer, TOOL_NAME)
  }

  check(): boolean {
    return true
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const params = (ctx.toolCall.arguments ?? {}) as unknown as WriteFileParams
    const result: Record<string, unknown> = {}
    try {
      // path + content 必填
      const pathStr = (params.path ?? '').trim()
      if (!pathStr) {
        return ToolResult.sync(JSON.stringify({ error: 'path 不能为空' }))
      }
      const content = params.content ?? ''

      // 敏感路径守卫
      const sensitiveErr = checkSensitivePath(pathStr)
      if (sensitiveErr) {
        return ToolResult.sync(JSON.stringify({ error: sensitiveErr }))
      }

      // read_file 行号内容拒绝
      if (looksLikeReadFileLineNumberedContent(content)) {
        return ToolResult.sync(JSON.stringify({
          error: 'Refusing to write internal read_file display text as file content. '
            + 'Strip read_file line-number prefixes or reconstruct the intended file contents before writing.'
        }))
      }

      const resolvedPath = resolve(pathStr)
      const dir = dirname(resolvedPath)
      let dirsCreated = false
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
        dirsCreated = true
      }
      writeFileSync(resolvedPath, content, 'utf-8')

      // _dict + resolved_path/files_modified
      result['bytes_written'] = Buffer.byteLength(content, 'utf-8')
      result['dirs_created'] = dirsCreated
      result['resolved_path'] = resolvedPath
      result['files_modified'] = [resolvedPath]

      return ToolResult.sync(JSON.stringify(result))
    } catch (err) {
      return ToolResult.sync(JSON.stringify({ error: `写入文件失败: ${(err as Error).message}` }))
    }
  }
}
