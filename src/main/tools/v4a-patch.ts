/**
 * v4a-patch.ts — 客户端工具内部模块
 *
 * V4A patch parser:
 * - parse_v4a_patch：解析 *** Begin Patch / *** End Patch 之间的
 *   Update / Add / Delete / Move 操作 + hunks
 * - 两阶段：先 validate（模拟应用，不写文件）→ 全部通过才 apply
 * - apply 时逐 hunk 走 fuzzyFindAndReplace
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, renameSync } from 'fs'
import { unifiedDiff } from '../utils/diff'
import { dirname } from 'path'
import { fuzzyFindAndReplace, formatNoMatchHint } from './fuzzy-match'
import type { Hunk, PatchApplyResult, PatchOperation } from './types'

// ── 解析 ──

export function parseV4aPatch(patchContent: string): { operations: PatchOperation[]; error: string | null } {
  const lines = patchContent.split('\n')
  const operations: PatchOperation[] = []

  let startIdx: number | null = null
  let endIdx: number | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes('*** Begin Patch') || line.includes('***Begin Patch')) startIdx = i
    else if (line.includes('*** End Patch') || line.includes('***End Patch')) { endIdx = i; break }
  }
  if (startIdx === null) startIdx = -1
  if (endIdx === null) endIdx = lines.length

  let i = startIdx + 1
  let currentOp: PatchOperation | null = null
  let currentHunk: Hunk | null = null

  while (i < endIdx) {
    const line = lines[i]
    const updateMatch = /^\*\*\*\s*Update\s+File:\s*(.+)$/.exec(line)
    const addMatch = /^\*\*\*\s*Add\s+File:\s*(.+)$/.exec(line)
    const deleteMatch = /^\*\*\*\s*Delete\s+File:\s*(.+)$/.exec(line)
    const moveMatch = /^\*\*\*\s*Move\s+File:\s*(.+?)\s*->\s*(.+)$/.exec(line)

    if (updateMatch) {
      if (currentOp) {
        if (currentHunk && currentHunk.lines.length > 0) currentOp.hunks.push(currentHunk)
        operations.push(currentOp)
      }
      currentOp = { operation: 'UPDATE', filePath: updateMatch[1].trim(), hunks: [] }
      currentHunk = null
    } else if (addMatch) {
      if (currentOp) {
        if (currentHunk && currentHunk.lines.length > 0) currentOp.hunks.push(currentHunk)
        operations.push(currentOp)
      }
      currentOp = { operation: 'ADD', filePath: addMatch[1].trim(), hunks: [] }
      currentHunk = { contextHint: null, lines: [] }
    } else if (deleteMatch) {
      if (currentOp) {
        if (currentHunk && currentHunk.lines.length > 0) currentOp.hunks.push(currentHunk)
        operations.push(currentOp)
      }
      currentOp = { operation: 'DELETE', filePath: deleteMatch[1].trim(), hunks: [] }
      operations.push(currentOp)
      currentOp = null
      currentHunk = null
    } else if (moveMatch) {
      if (currentOp) {
        if (currentHunk && currentHunk.lines.length > 0) currentOp.hunks.push(currentHunk)
        operations.push(currentOp)
      }
      currentOp = { operation: 'MOVE', filePath: moveMatch[1].trim(), newPath: moveMatch[2].trim(), hunks: [] }
      operations.push(currentOp)
      currentOp = null
      currentHunk = null
    } else if (line.startsWith('@@')) {
      if (currentOp) {
        if (currentHunk && currentHunk.lines.length > 0) currentOp.hunks.push(currentHunk)
        const hintMatch = /^@@\s*(.+?)\s*@@/.exec(line)
        currentHunk = { contextHint: hintMatch ? hintMatch[1] : null, lines: [] }
      }
    } else if (currentOp && line) {
      if (currentHunk === null) currentHunk = { contextHint: null, lines: [] }
      if (line.startsWith('+')) currentHunk.lines.push({ prefix: '+', content: line.slice(1) })
      else if (line.startsWith('-')) currentHunk.lines.push({ prefix: '-', content: line.slice(1) })
      else if (line.startsWith(' ')) currentHunk.lines.push({ prefix: ' ', content: line.slice(1) })
      else if (line.startsWith('\\')) { /* no newline marker - skip */ }
      else currentHunk.lines.push({ prefix: ' ', content: line })
    }
    i++
  }

  if (currentOp) {
    if (currentHunk && currentHunk.lines.length > 0) currentOp.hunks.push(currentHunk)
    operations.push(currentOp)
  }

  if (operations.length === 0) return { operations, error: null }

  const parseErrors: string[] = []
  for (const op of operations) {
    if (!op.filePath) parseErrors.push('Operation with empty file path')
    if (op.operation === 'UPDATE' && op.hunks.length === 0) parseErrors.push(`UPDATE '${op.filePath}': no hunks found`)
    if (op.operation === 'MOVE' && !op.newPath) parseErrors.push(`MOVE '${op.filePath}': missing destination path (expected 'src -> dst')`)
  }
  if (parseErrors.length > 0) return { operations: [], error: 'Parse error: ' + parseErrors.join('; ') }
  return { operations, error: null }
}

function countOccurrences(text: string, pattern: string): number {
  let count = 0
  let start = 0
  while (true) {
    const pos = text.indexOf(pattern, start)
    if (pos === -1) break
    count++
    start = pos + 1
  }
  return count
}

function readFileRaw(p: string): { content: string; error: string | null } {
  try {
    return { content: readFileSync(p, 'utf-8'), error: null }
  } catch (err) {
    return { content: '', error: err instanceof Error ? err.message : String(err) }
  }
}

// ── 阶段 1：验证（不写文件，模拟应用）──

function validateOperations(operations: PatchOperation[]): { errors: string[]; realChangeCount: number } {
  const errors: string[] = []
  let realChangeCount = 0

  for (const op of operations) {
    if (op.operation !== 'UPDATE') realChangeCount++

    if (op.operation === 'UPDATE') {
      const read = readFileRaw(op.filePath)
      if (read.error) { errors.push(`${op.filePath}: ${read.error}`); continue }

      let simulated = read.content
      for (let hunkIndex = 0; hunkIndex < op.hunks.length; hunkIndex++) {
        const hunk = op.hunks[hunkIndex]
        const searchLines = hunk.lines.filter(l => l.prefix === ' ' || l.prefix === '-').map(l => l.content)
        const removedLines = hunk.lines.filter(l => l.prefix === '-').map(l => l.content)
        const addedLines = hunk.lines.filter(l => l.prefix === '+').map(l => l.content)
        if (removedLines.length === 0 && addedLines.length === 0) continue // inert anchor hunk
        realChangeCount++
        if (searchLines.length === 0) {
          // 纯新增 hunk：校验 context hint 唯一性
          if (hunk.contextHint) {
            const occurrences = countOccurrences(simulated, hunk.contextHint)
            if (occurrences === 0) {
              errors.push(`${op.filePath}: addition-only hunk context hint '${hunk.contextHint}' not found`)
            } else if (occurrences > 1) {
              errors.push(`${op.filePath}: addition-only hunk context hint '${hunk.contextHint}' is ambiguous (${occurrences} occurrences)`)
            }
          }
          continue
        }
        const searchPattern = searchLines.join('\n')
        const replaceLines = hunk.lines.filter(l => l.prefix === ' ' || l.prefix === '+').map(l => l.content)
        const replacement = replaceLines.join('\n')

        const res = fuzzyFindAndReplace(simulated, searchPattern, replacement, false)
        if (res.matchCount === 0) {
          const label = hunk.contextHint ? `'${hunk.contextHint}'` : '(no hint)'
          let msg = `${op.filePath}: hunk ${hunkIndex + 1} ${label} not found`
          if (res.error) msg += ` — ${res.error}`
          msg += formatNoMatchHint(res.error, res.matchCount, searchPattern, simulated)
          errors.push(msg)
        } else {
          simulated = res.content
        }
      }
    } else if (op.operation === 'DELETE') {
      const read = readFileRaw(op.filePath)
      if (read.error) errors.push(`${op.filePath}: file not found for deletion`)
    } else if (op.operation === 'MOVE') {
      if (!op.newPath) { errors.push(`${op.filePath}: MOVE operation missing destination path`); continue }
      const src = readFileRaw(op.filePath)
      if (src.error) errors.push(`${op.filePath}: source file not found for move`)
      const dst = readFileRaw(op.newPath)
      if (!dst.error) errors.push(`${op.newPath}: destination already exists — move would overwrite`)
    }
    // ADD：目录创建交给写入，无需预检
  }

  if (errors.length === 0 && realChangeCount === 0) {
    errors.push('Patch contains no changes (only context lines were provided)')
  }
  return { errors, realChangeCount }
}

// ── 阶段 2：应用 ──

function applyUpdate(op: PatchOperation): { success: boolean; diff: string } {
  const originalContent = readFileRaw(op.filePath)
  if (originalContent.error) return { success: false, diff: originalContent.error }
  let simulated = originalContent.content
  for (const hunk of op.hunks) {
    const searchLines = hunk.lines.filter(l => l.prefix === ' ' || l.prefix === '-').map(l => l.content)
    const removedLines = hunk.lines.filter(l => l.prefix === '-').map(l => l.content)
    const addedLines = hunk.lines.filter(l => l.prefix === '+').map(l => l.content)
    if (removedLines.length === 0 && addedLines.length === 0) continue
    if (searchLines.length === 0) {
      // 纯新增 hunk：插入到 context hint 位置之后
      if (hunk.contextHint) {
        const pos = simulated.indexOf(hunk.contextHint)
        if (pos === -1) return { success: false, diff: `context hint '${hunk.contextHint}' not found` }
        const insertPoint = pos + hunk.contextHint.length
        const insertText = addedLines.join('\n')
        simulated = simulated.slice(0, insertPoint) + '\n' + insertText + simulated.slice(insertPoint)
      }
      continue
    }
    const searchPattern = searchLines.join('\n')
    const replaceLines = hunk.lines.filter(l => l.prefix === ' ' || l.prefix === '+').map(l => l.content)
    const res = fuzzyFindAndReplace(simulated, searchPattern, replaceLines.join('\n'), false)
    if (res.matchCount === 0) return { success: false, diff: `${op.filePath}: hunk not found — ${res.error ?? ''}` }
    simulated = res.content
  }
  writeFileSync(op.filePath, simulated, 'utf-8')
  return { success: true, diff: unifiedDiff(originalContent.content, simulated, op.filePath) }
}

function applyAdd(op: PatchOperation): { success: boolean; diff: string } {
  const contentLines: string[] = []
  for (const hunk of op.hunks) {
    for (const line of hunk.lines) {
      if (line.prefix === '+') contentLines.push(line.content)
    }
  }
  const content = contentLines.join('\n')
  const dir = dirname(op.filePath)
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(op.filePath, content, 'utf-8')
  const diff = `--- /dev/null\n+++ b/${op.filePath}\n` + contentLines.map(l => `+${l}`).join('\n')
  return { success: true, diff }
}

function applyDelete(op: PatchOperation): { success: boolean; diff: string } {
  const read = readFileRaw(op.filePath)
  if (read.error) return { success: false, diff: read.error }
  const diff = unifiedDiff(read.content, '', op.filePath)
  unlinkSync(op.filePath)
  return { success: true, diff }
}

function applyMove(op: PatchOperation): { success: boolean; diff: string } {
  if (!op.newPath) return { success: false, diff: 'missing destination path' }
  const read = readFileRaw(op.filePath)
  if (read.error) return { success: false, diff: read.error }
  const dstDir = dirname(op.newPath)
  if (dstDir && !existsSync(dstDir)) mkdirSync(dstDir, { recursive: true })
  renameSync(op.filePath, op.newPath)
  const diff = `--- a/${op.filePath}\n+++ b/${op.newPath}\n` + read.content.split('\n').map(l => ` ${l}`).join('\n')
  return { success: true, diff }
}

// ── 主入口（对齐 apply_v4a_operations）──

export function applyV4aOperations(operations: PatchOperation[]): PatchApplyResult {
  const { errors: validationErrors } = validateOperations(operations)
  if (validationErrors.length > 0) {
    return {
      success: false,
      diff: '',
      filesModified: [],
      filesCreated: [],
      filesDeleted: [],
      error: 'Patch validation failed (no files were modified):\n' + validationErrors.map(e => `  • ${e}`).join('\n')
    }
  }

  const filesModified: string[] = []
  const filesCreated: string[] = []
  const filesDeleted: string[] = []
  const allDiffs: string[] = []
  const errors: string[] = []

  for (const op of operations) {
    try {
      let result: { success: boolean; diff: string }
      if (op.operation === 'ADD') {
        result = applyAdd(op)
        if (result.success) { filesCreated.push(op.filePath); allDiffs.push(result.diff) }
        else errors.push(`Failed to add ${op.filePath}: ${result.diff}`)
      } else if (op.operation === 'DELETE') {
        result = applyDelete(op)
        if (result.success) { filesDeleted.push(op.filePath); allDiffs.push(result.diff) }
        else errors.push(`Failed to delete ${op.filePath}: ${result.diff}`)
      } else if (op.operation === 'MOVE') {
        result = applyMove(op)
        if (result.success) { filesModified.push(`${op.filePath} -> ${op.newPath}`); allDiffs.push(result.diff) }
        else errors.push(`Failed to move ${op.filePath}: ${result.diff}`)
      } else {
        result = applyUpdate(op)
        if (result.success) { filesModified.push(op.filePath); allDiffs.push(result.diff) }
        else errors.push(`Failed to update ${op.filePath}: ${result.diff}`)
      }
    } catch (err) {
      errors.push(`Error processing ${op.filePath}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const combinedDiff = allDiffs.join('\n')
  if (errors.length > 0) {
    return {
      success: false,
      diff: combinedDiff,
      filesModified, filesCreated, filesDeleted,
      error: 'Apply phase failed (state may be inconsistent — run `git diff` to assess):\n' + errors.map(e => `  • ${e}`).join('\n')
    }
  }
  return { success: true, diff: combinedDiff, filesModified, filesCreated, filesDeleted }
}
