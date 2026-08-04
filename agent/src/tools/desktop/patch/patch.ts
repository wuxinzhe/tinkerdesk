/**
 * patch.ts — 客户端工具
 *
 * 一比一复刻 Hermes patch_tool：
 * - mode=replace：9 策略模糊匹配（fuzzy-match.ts）
 * - mode=patch：V4A 多文件 patch（v4a-patch.ts，两阶段 validate-then-apply）
 * - 敏感路径守卫 + V4A 头部 .. traversal 拒绝
 * - 返回 JSON 字符串 {success, diff, files_modified, files_created, files_deleted, error, _hint}
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { BaseTool } from '../index'
import type { ToolResult, AvailabilityResult, ToolSchema } from '../index'
import { fuzzyFindAndReplace, formatNoMatchHint } from './fuzzy-match'
import { parseV4aPatch, applyV4aOperations } from './v4a-patch'

import type { PatchParams } from '@/defines/tools/params'

// ── 安全守卫（与 write-file.ts 同源）──

const SENSITIVE_PATH_PREFIXES = [
  'C:\\Windows\\', 'C:\\Program Files\\', 'C:\\Program Files (x86)\\',
  'C:\\ProgramData\\', 'C:\\Users\\Default\\',
  '/etc/', '/boot/', '/usr/lib/systemd/', '/private/etc/', '/private/var/'
]
const SENSITIVE_EXACT_PATHS = new Set([
  'C:\\Windows\\System32\\drivers\\etc\\hosts',
  'C:\\pagefile.sys', 'C:\\hiberfil.sys', 'C:\\swapfile.sys',
  '/var/run/docker.sock', '/run/docker.sock'
])

function checkSensitivePath(filepath: string): string | null {
  const normalized = resolve(filepath)
  for (const prefix of SENSITIVE_PATH_PREFIXES) {
    if (normalized.toLowerCase().startsWith(prefix.toLowerCase())) {
      return `Refusing to write to sensitive system path: ${filepath}\nUse the terminal tool if you need to modify system files.`
    }
  }
  if (SENSITIVE_EXACT_PATHS.has(normalized)) {
    return `Refusing to write to sensitive system path: ${filepath}\nUse the terminal tool if you need to modify system files.`
  }
  return null
}

/** V4A 头部 .. traversal 拒绝（对齐 Hermes patch_tool） */
function rejectV4aTraversal(v4aPath: string): string | null {
  if (v4aPath.split(/[\\/]/).includes('..')) {
    return (
      `V4A patch header contains '..' traversal: ${JSON.stringify(v4aPath)}. `
      + "Use the agent's cwd-relative path (no '..') or an absolute path in "
      + "'*** Update File:' / '*** Add File:' / '*** Delete File:' / '*** Move File:' headers."
    )
  }
  return null
}

function unifiedDiff(oldContent: string, newContent: string, filePath: string): string {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  const out: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`]
  let i = 0, j = 0
  const body: string[] = []
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      body.push(' ' + oldLines[i]); i++; j++
    } else {
      if (i < oldLines.length) { body.push('-' + oldLines[i]); i++ }
      if (j < newLines.length) { body.push('+' + newLines[j]); j++ }
    }
  }
  out.push(`@@ -1,${oldLines.length} +1,${newLines.length} @@`)
  out.push(...body)
  return out.join('\n')
}

// ── 工具类 ──

export class PatchTool extends BaseTool<PatchParams> {
  readonly id = 'desktop_showing_patch'
  readonly name = '文件编辑'
  readonly description = 'Targeted find-and-replace edits in files. Uses fuzzy matching so minor whitespace/indentation differences won\'t break it. Supports replace mode and V4A multi-file patch mode.'
  readonly category = 'file'

  getSchema(): ToolSchema {
    return {
      type: 'function',
      function: {
        name: 'desktop_showing_patch',
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              description: 'Patch mode: "replace" (default) or "patch" (V4A multi-file format)',
              enum: ['replace', 'patch']
            },
            path: {
              type: 'string',
              description: 'Path to the file to edit (replace mode)'
            },
            old_string: {
              type: 'string',
              description: 'The text to find (fuzzy matched, so minor whitespace/indentation differences are tolerated)'
            },
            new_string: {
              type: 'string',
              description: 'The replacement text'
            },
            replace_all: {
              type: 'boolean',
              description: 'Replace all occurrences instead of requiring uniqueness',
              default: false
            },
            patch: {
              type: 'string',
              description: 'V4A patch content (mode=patch): *** Begin Patch / *** Update File: path / @@ hint @@ / -old / +new / *** End Patch'
            }
          },
          required: ['mode']
        }
      },
      toolType: 'desktop',
      emoji: '✂️'
    }
  }

  async checkAvailability(): Promise<AvailabilityResult> {
    return { available: true }
  }

  async execute(params: PatchParams): Promise<ToolResult> {
    try {
      const mode = params.mode ?? 'replace'
      const resultDict: Record<string, unknown> = {}

      if (mode === 'replace') {
        if (!params.path) return { ok: false, error: 'path required' }
        if (params.old_string === null || params.old_string === undefined || params.new_string === null || params.new_string === undefined) {
          return { ok: false, error: 'old_string and new_string required' }
        }

        // 敏感路径守卫
        const sensitiveErr = checkSensitivePath(params.path)
        if (sensitiveErr) return { ok: false, error: sensitiveErr }

        const resolvedPath = resolve(params.path)
        if (!existsSync(resolvedPath)) {
          return { ok: false, error: `文件不存在: ${params.path}` }
        }
        const originalContent = readFileSync(resolvedPath, 'utf-8')

        const res = fuzzyFindAndReplace(originalContent, params.old_string, params.new_string, params.replace_all === true)
        if (res.matchCount === 0) {
          let errMsg = res.error ?? 'Could not find match for old_string'
          errMsg += formatNoMatchHint(errMsg, res.matchCount, params.old_string, originalContent)
          // 连续失败提示（对齐 Hermes _hint）
          resultDict['_hint'] = (
            `old_string not found. Use read_file to verify the current content, `
            + `or search_files to locate the text.`
          )
          return { ok: false, data: JSON.stringify({ success: false, error: errMsg, _hint: resultDict['_hint'] }), error: undefined }
        }

        // 写入（无行尾检测——Node writeFileSync 原样写，不做 CRLF 转换；对齐 Hermes 的行尾保持目标）
        const { writeFileSync } = require('fs') as typeof import('fs')
        writeFileSync(resolvedPath, res.content, 'utf-8')

        const diff = unifiedDiff(originalContent, res.content, params.path)
        resultDict['success'] = true
        resultDict['diff'] = diff
        resultDict['files_modified'] = [resolvedPath]
        resultDict['resolved_path'] = resolvedPath
        resultDict['strategy'] = res.strategy
        return { ok: true, data: JSON.stringify(resultDict) }
      }

      if (mode === 'patch') {
        if (!params.patch) return { ok: false, error: 'patch content required' }

        // 提取 V4A 头部路径 → 敏感路径 + traversal 检查
        const pathsToCheck: string[] = []
        const updateRe = /^\*\*\*\s*(?:Update|Add|Delete)\s+File:\s*(.+)$/gm
        let m: RegExpExecArray | null
        while ((m = updateRe.exec(params.patch)) !== null) {
          const v4aPath = m[1].trim()
          const traversalErr = rejectV4aTraversal(v4aPath)
          if (traversalErr) return { ok: false, error: traversalErr }
          pathsToCheck.push(v4aPath)
        }
        const moveRe = /^\*\*\*\s*Move\s+File:\s*(.+?)\s*->\s*(.+)$/gm
        while ((m = moveRe.exec(params.patch)) !== null) {
          for (const p of [m[1].trim(), m[2].trim()]) {
            const traversalErr = rejectV4aTraversal(p)
            if (traversalErr) return { ok: false, error: traversalErr }
            pathsToCheck.push(p)
          }
        }
        for (const p of pathsToCheck) {
          const sensitiveErr = checkSensitivePath(p)
          if (sensitiveErr) return { ok: false, error: sensitiveErr }
        }

        const { operations, error: parseError } = parseV4aPatch(params.patch)
        if (parseError) return { ok: false, error: parseError }
        if (operations.length === 0) return { ok: false, error: 'Patch contains no operations' }

        const result = applyV4aOperations(operations)
        resultDict['success'] = result.success
        if (result.diff) resultDict['diff'] = result.diff
        if (result.filesModified.length > 0) resultDict['files_modified'] = result.filesModified
        if (result.filesCreated.length > 0) resultDict['files_created'] = result.filesCreated
        if (result.filesDeleted.length > 0) resultDict['files_deleted'] = result.filesDeleted
        if (result.error) resultDict['error'] = result.error

        return { ok: result.success, data: JSON.stringify(resultDict), error: result.success ? undefined : result.error }
      }

      return { ok: false, error: `Unknown mode: ${mode}` }
    } catch (err: any) {
      return { ok: false, error: `编辑文件失败: ${err.message}` }
    }
  }
}

/** 单例实例 */
export const patchTool = new PatchTool()
