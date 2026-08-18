/**
 * desktop/patch-tool.ts — 文件编辑工具
 *
 * Patch tool:
 * - mode=replace：9 策略模糊匹配（fuzzy-match.ts）
 * - mode=patch：V4A 多文件 patch（v4a-patch.ts，两阶段 validate-then-apply）
 * - 敏感路径守卫 + V4A 头部 .. traversal 拒绝
 */
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { BaseTool } from './base-tool'
import { ToolResult } from '../../core/tool/tool-result'
import { fuzzyFindAndReplace, formatNoMatchHint } from './fuzzy-match'
import { parseV4aPatch, applyV4aOperations } from './v4a-patch'
import { checkSensitivePath, rejectV4aTraversal } from '../../utils/path-security'
import { unifiedDiff } from '../../utils/diff'
import type { PromptRenderer } from '../../core/prompt/renderer'
import type { ToolContext } from '../../core/loop/types'
import type { PatchParams } from './types'

/** 工具名 */
export const TOOL_NAME = 'desktop_tinker_patch'



export class PatchTool extends BaseTool {
  constructor(renderer: PromptRenderer) {
    super(renderer, TOOL_NAME)
  }

  check(): boolean {
    return true
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const params = (ctx.toolCall.arguments ?? {}) as unknown as PatchParams
    try {
      const mode = params.mode ?? 'replace'
      const resultDict: Record<string, unknown> = {}

      if (mode === 'replace') {
        if (!params.path) return ToolResult.sync(JSON.stringify({ success: false, error: 'path required' }))
        if (params.old_string === null || params.old_string === undefined || params.new_string === null || params.new_string === undefined) {
          return ToolResult.sync(JSON.stringify({ success: false, error: 'old_string and new_string required' }))
        }

        // 敏感路径守卫
        const sensitiveErr = checkSensitivePath(params.path)
        if (sensitiveErr) return ToolResult.sync(JSON.stringify({ success: false, error: sensitiveErr }))

        const resolvedPath = resolve(params.path)
        if (!existsSync(resolvedPath)) {
          return ToolResult.sync(JSON.stringify({ success: false, error: `文件不存在: ${params.path}` }))
        }
        const originalContent = readFileSync(resolvedPath, 'utf-8')

        const res = fuzzyFindAndReplace(originalContent, params.old_string, params.new_string, params.replace_all === true)
        if (res.matchCount === 0) {
          let errMsg = res.error ?? 'Could not find match for old_string'
          errMsg += formatNoMatchHint(errMsg, res.matchCount, params.old_string, originalContent)
          // 连续失败提示
          resultDict['_hint'] = (
            'old_string not found. Use read_file to verify the current content, '
            + 'or search_files to locate the text.'
          )
          return ToolResult.sync(JSON.stringify({ success: false, error: errMsg, _hint: resultDict['_hint'] }))
        }

        // 写入
        writeFileSync(resolvedPath, res.content, 'utf-8')

        const diff = unifiedDiff(originalContent, res.content, params.path)
        resultDict['success'] = true
        resultDict['diff'] = diff
        resultDict['files_modified'] = [resolvedPath]
        resultDict['resolved_path'] = resolvedPath
        resultDict['strategy'] = res.strategy
        return ToolResult.sync(JSON.stringify(resultDict))
      }

      if (mode === 'patch') {
        if (!params.patch) return ToolResult.sync(JSON.stringify({ success: false, error: 'patch content required' }))

        // 提取 V4A 头部路径 → 敏感路径 + traversal 检查
        const pathsToCheck: string[] = []
        const updateRe = /^\*\*\*\s*(?:Update|Add|Delete)\s+File:\s*(.+)$/gm
        let m: RegExpExecArray | null
        while ((m = updateRe.exec(params.patch)) !== null) {
          const v4aPath = m[1].trim()
          const traversalErr = rejectV4aTraversal(v4aPath)
          if (traversalErr) return ToolResult.sync(JSON.stringify({ success: false, error: traversalErr }))
          pathsToCheck.push(v4aPath)
        }
        const moveRe = /^\*\*\*\s*Move\s+File:\s*(.+?)\s*->\s*(.+)$/gm
        while ((m = moveRe.exec(params.patch)) !== null) {
          for (const p of [m[1].trim(), m[2].trim()]) {
            const traversalErr = rejectV4aTraversal(p)
            if (traversalErr) return ToolResult.sync(JSON.stringify({ success: false, error: traversalErr }))
            pathsToCheck.push(p)
          }
        }
        for (const p of pathsToCheck) {
          const sensitiveErr = checkSensitivePath(p)
          if (sensitiveErr) return ToolResult.sync(JSON.stringify({ success: false, error: sensitiveErr }))
        }

        const { operations, error: parseError } = parseV4aPatch(params.patch)
        if (parseError) return ToolResult.sync(JSON.stringify({ success: false, error: parseError }))
        if (operations.length === 0) return ToolResult.sync(JSON.stringify({ success: false, error: 'Patch contains no operations' }))

        const result = applyV4aOperations(operations)
        resultDict['success'] = result.success
        if (result.diff) resultDict['diff'] = result.diff
        if (result.filesModified.length > 0) resultDict['files_modified'] = result.filesModified
        if (result.filesCreated.length > 0) resultDict['files_created'] = result.filesCreated
        if (result.filesDeleted.length > 0) resultDict['files_deleted'] = result.filesDeleted
        if (result.error) resultDict['error'] = result.error

        return ToolResult.sync(JSON.stringify(resultDict))
      }

      return ToolResult.sync(JSON.stringify({ success: false, error: `Unknown mode: ${mode}` }))
    } catch (err) {
      return ToolResult.sync(JSON.stringify({ success: false, error: `编辑文件失败: ${(err as Error).message}` }))
    }
  }
}
