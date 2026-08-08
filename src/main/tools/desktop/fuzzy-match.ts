/**
 * fuzzy-match.ts — 客户端工具内部模块
 *
 * 一比一复刻 Hermes tools/fuzzy_match.py 的 9 策略模糊匹配链：
 * exact → line_trimmed → whitespace_normalized → indentation_flexible
 * → escape_normalized → trimmed_boundary → unicode_normalized
 * → block_anchor → context_aware
 *
 * 附带完整守卫：escape drift 检测、\\t/\\r 条件反转义、Unicode 保留、
 * 缩进重对齐、"Did you mean" 提示。
 */
import type { FuzzyResult, MatchSpan, Opcode } from './types'

// ── Unicode 归一化──

const UNICODE_MAP: Record<string, string> = {
  '\u201c': '"', '\u201d': '"',  // smart double quotes
  '\u2018': "'", '\u2019': "'",  // smart single quotes
  '\u2014': '--', '\u2013': '-', // em/en dashes
  '\u2026': '...', '\u00a0': ' ' // ellipsis and non-breaking space
}

function unicodeNormalize(text: string): string {
  for (const [char, repl] of Object.entries(UNICODE_MAP)) {
    text = text.split(char).join(repl)
  }
  return text
}

// ── SequenceMatcher ratio──

function lcsLength(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0 || n === 0) return 0
  // 空间优化：只保留两行 DP
  let prev = new Array(n + 1).fill(0)
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1).fill(0)
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    }
    prev = cur
  }
  return prev[n]
}

export function sequenceRatio(a: string, b: string): number {
  if (a.length + b.length === 0) return 1.0
  const lcs = lcsLength(a, b)
  return (2.0 * lcs) / (a.length + b.length)
}

/** difflib.SequenceMatcher.get_opcodes 简化版（用于 unicode 保留） */
export function getOpcodes(a: string, b: string): Opcode[] {
  // 简化实现：基于 LCS 回溯生成 opcodes
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const ops: Opcode[] = []
  let i = m, j = n
  // 回溯收集操作（逆序）
  const rev: Opcode[] = []
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      rev.push({ tag: 'equal', i1: i - 1, i2: i, j1: j - 1, j2: j })
      i--; j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      rev.push({ tag: 'delete', i1: i - 1, i2: i, j1: j - 1, j2: j - 1 })
      i--
    } else {
      rev.push({ tag: 'insert', i1: i - 1, i2: i - 1, j1: j - 1, j2: j })
      j--
    }
  }
  while (i > 0) { rev.push({ tag: 'delete', i1: i - 1, i2: i, j1: 0, j2: 0 }); i-- }
  while (j > 0) { rev.push({ tag: 'insert', i1: 0, i2: 0, j1: j - 1, j2: j }); j-- }
  rev.reverse()
  // 合并相邻同类型 opcode
  for (const op of rev) {
    const last = ops[ops.length - 1]
    if (last && last.tag === op.tag
      && (op.tag !== 'equal' || (last.i2 === op.i1 && last.j2 === op.j1))) {
      last.i2 = op.i2; last.j2 = op.j2
    } else {
      ops.push({ ...op })
    }
  }
  return ops
}

// ── 策略 1：精确匹配 ──

function strategyExact(content: string, pattern: string): MatchSpan[] {
  const matches: MatchSpan[] = []
  let start = 0
  while (true) {
    const pos = content.indexOf(pattern, start)
    if (pos === -1) break
    matches.push([pos, pos + pattern.length])
    // 跳过整个 match
    start = pos + pattern.length
  }
  return matches
}

// ── 位置工具 ──

function calculateLinePositions(contentLines: string[], startLine: number, endLine: number, contentLength: number): MatchSpan {
  let startPos = 0
  for (let i = 0; i < startLine; i++) startPos += contentLines[i].length + 1
  let endPos = 0
  for (let i = 0; i < endLine; i++) endPos += contentLines[i].length + 1
  endPos -= 1
  endPos = Math.min(contentLength, endPos)
  return [startPos, endPos]
}

function findNormalizedMatches(
  content: string, contentLines: string[], contentNormalizedLines: string[],
  pattern: string, patternNormalized: string
): MatchSpan[] {
  const patternNormLines = patternNormalized.split('\n')
  const numPatternLines = patternNormLines.length
  const matches: MatchSpan[] = []
  for (let i = 0; i <= contentNormalizedLines.length - numPatternLines; i++) {
    const block = contentNormalizedLines.slice(i, i + numPatternLines).join('\n')
    if (block === patternNormalized) {
      matches.push(calculateLinePositions(contentLines, i, i + numPatternLines, content.length))
    }
  }
  return matches
}

// ── 策略 2：逐行 trim ──

function strategyLineTrimmed(content: string, pattern: string): MatchSpan[] {
  const patternNormalized = pattern.split('\n').map(l => l.trim()).join('\n')
  const contentLines = content.split('\n')
  const contentNormalizedLines = contentLines.map(l => l.trim())
  return findNormalizedMatches(content, contentLines, contentNormalizedLines, pattern, patternNormalized)
}

// ── 策略 3：空白折叠 ──

function mapNormalizedPositions(original: string, normalized: string, normalizedMatches: MatchSpan[]): MatchSpan[] {
  if (normalizedMatches.length === 0) return []
  const origToNorm: number[] = []
  let origIdx = 0
  let normIdx = 0
  while (origIdx < original.length && normIdx < normalized.length) {
    if (original[origIdx] === normalized[normIdx]) {
      origToNorm.push(normIdx)
      origIdx++; normIdx++
    } else if ((' \t').includes(original[origIdx]) && normalized[normIdx] === ' ') {
      origToNorm.push(normIdx)
      origIdx++
      if (origIdx < original.length && !(' \t').includes(original[origIdx])) normIdx++
    } else if ((' \t').includes(original[origIdx])) {
      origToNorm.push(normIdx)
      origIdx++
    } else {
      origToNorm.push(normIdx)
      origIdx++
    }
  }
  while (origIdx < original.length) { origToNorm.push(normalized.length); origIdx++ }

  const normToOrigStart: Record<number, number> = {}
  const normToOrigEnd: Record<number, number> = {}
  origToNorm.forEach((np, origPos) => {
    if (!(np in normToOrigStart)) normToOrigStart[np] = origPos
    normToOrigEnd[np] = origPos
  })

  const originalMatches: MatchSpan[] = []
  for (const [normStart, normEnd] of normalizedMatches) {
    let origStart: number
    if (normStart in normToOrigStart) origStart = normToOrigStart[normStart]
    else origStart = Math.min(...origToNorm.map((n, i) => (n >= normStart ? i : Infinity)))
    let origEnd: number
    if ((normEnd - 1) in normToOrigEnd) origEnd = normToOrigEnd[normEnd - 1] + 1
    else origEnd = origStart + (normEnd - normStart)
    // 展开尾部空白（仅当归一化匹配以空白结尾）
    if (normEnd < normalized.length && normalized[normEnd - 1] === ' ') {
      while (origEnd < original.length && (' \t').includes(original[origEnd])) origEnd++
    }
    originalMatches.push([origStart, Math.min(origEnd, original.length)])
  }
  return originalMatches
}

function strategyWhitespaceNormalized(content: string, pattern: string): MatchSpan[] {
  const normalize = (s: string) => s.replace(/[ \t]+/g, ' ')
  const patternNormalized = normalize(pattern)
  const contentNormalized = normalize(content)
  const matchesInNormalized = strategyExact(contentNormalized, patternNormalized)
  if (matchesInNormalized.length === 0) return []
  return mapNormalizedPositions(content, contentNormalized, matchesInNormalized)
}

// ── 策略 4：忽略缩进 ──

function strategyIndentationFlexible(content: string, pattern: string): MatchSpan[] {
  const contentLines = content.split('\n')
  const contentStrippedLines = contentLines.map(l => l.replace(/^\s+/, ''))
  const patternLines = pattern.split('\n').map(l => l.replace(/^\s+/, ''))
  return findNormalizedMatches(content, contentLines, contentStrippedLines, pattern, patternLines.join('\n'))
}

// ── 策略 5：转义归一化 ──

function strategyEscapeNormalized(content: string, pattern: string): MatchSpan[] {
  const unescape = (s: string) => s.split('\\n').join('\n').split('\\t').join('\t').split('\\r').join('\r')
  const patternUnescaped = unescape(pattern)
  if (patternUnescaped === pattern) return []
  return strategyExact(content, patternUnescaped)
}

// ── 策略 6：边界 trim ──

function strategyTrimmedBoundary(content: string, pattern: string): MatchSpan[] {
  const patternLines = pattern.split('\n')
  if (patternLines.length === 0) return []
  patternLines[0] = patternLines[0].trim()
  if (patternLines.length > 1) patternLines[patternLines.length - 1] = patternLines[patternLines.length - 1].trim()
  const modifiedPattern = patternLines.join('\n')

  const contentLines = content.split('\n')
  const matches: MatchSpan[] = []
  const patternLineCount = patternLines.length
  for (let i = 0; i <= contentLines.length - patternLineCount; i++) {
    const blockLines = contentLines.slice(i, i + patternLineCount)
    const checkLines = [...blockLines]
    checkLines[0] = checkLines[0].trim()
    if (checkLines.length > 1) checkLines[checkLines.length - 1] = checkLines[checkLines.length - 1].trim()
    if (checkLines.join('\n') === modifiedPattern) {
      matches.push(calculateLinePositions(contentLines, i, i + patternLineCount, content.length))
    }
  }
  return matches
}

// ── Unicode 位置映射 ──

function buildOrigToNormMap(original: string): number[] {
  const result: number[] = []
  let normPos = 0
  for (const char of original) {
    result.push(normPos)
    const repl = UNICODE_MAP[char]
    normPos += repl !== undefined ? repl.length : 1
  }
  result.push(normPos)
  return result
}

function mapPositionsNormToOrig(origToNorm: number[], normMatches: MatchSpan[]): MatchSpan[] {
  const normToOrigStart: Record<number, number> = {}
  for (let origPos = 0; origPos < origToNorm.length - 1; origPos++) {
    const np = origToNorm[origPos]
    if (!(np in normToOrigStart)) normToOrigStart[np] = origPos
  }
  const results: MatchSpan[] = []
  const origLen = origToNorm.length - 1
  for (const [normStart, normEnd] of normMatches) {
    if (!(normStart in normToOrigStart)) continue
    const origStart = normToOrigStart[normStart]
    let origEnd = origStart
    while (origEnd < origLen && origToNorm[origEnd] < normEnd) origEnd++
    results.push([origStart, origEnd])
  }
  return results
}

// ── 策略 7：Unicode 归一化 ──

function strategyUnicodeNormalized(content: string, pattern: string): MatchSpan[] {
  const normPattern = unicodeNormalize(pattern)
  const normContent = unicodeNormalize(content)
  if (normContent === content && normPattern === pattern) return []
  let normMatches = strategyExact(normContent, normPattern)
  if (normMatches.length === 0) normMatches = strategyLineTrimmed(normContent, normPattern)
  if (normMatches.length === 0) return []
  const origToNorm = buildOrigToNormMap(content)
  return mapPositionsNormToOrig(origToNorm, normMatches)
}

// ── 策略 8：块锚定 ──

function strategyBlockAnchor(content: string, pattern: string): MatchSpan[] {
  const normPattern = unicodeNormalize(pattern)
  const normContent = unicodeNormalize(content)
  const patternLines = normPattern.split('\n')
  if (patternLines.length < 2) return []
  const firstLine = patternLines[0].trim()
  const lastLine = patternLines[patternLines.length - 1].trim()
  const normContentLines = normContent.split('\n')
  const origContentLines = content.split('\n')
  const patternLineCount = patternLines.length

  const potentialMatches: number[] = []
  for (let i = 0; i <= normContentLines.length - patternLineCount; i++) {
    if (normContentLines[i].trim() === firstLine
      && normContentLines[i + patternLineCount - 1].trim() === lastLine) {
      potentialMatches.push(i)
    }
  }

  const matches: MatchSpan[] = []
  const threshold = potentialMatches.length === 1 ? 0.5 : 0.7
  for (const i of potentialMatches) {
    let similarity: number
    if (patternLineCount <= 2) {
      similarity = 1.0
    } else {
      const contentMiddle = normContentLines.slice(i + 1, i + patternLineCount - 1).join('\n')
      const patternMiddle = patternLines.slice(1, -1).join('\n')
      similarity = sequenceRatio(contentMiddle, patternMiddle)
    }
    if (similarity >= threshold) {
      matches.push(calculateLinePositions(origContentLines, i, i + patternLineCount, content.length))
    }
  }
  return matches
}

// ── 策略 9：上下文感知（逐行相似度 50% 阈值）──

function strategyContextAware(content: string, pattern: string): MatchSpan[] {
  const patternLines = pattern.split('\n')
  const contentLines = content.split('\n')
  if (patternLines.length === 0) return []
  const matches: MatchSpan[] = []
  const patternLineCount = patternLines.length
  for (let i = 0; i <= contentLines.length - patternLineCount; i++) {
    const blockLines = contentLines.slice(i, i + patternLineCount)
    let highSimilarityCount = 0
    for (let k = 0; k < patternLineCount; k++) {
      if (sequenceRatio(patternLines[k].trim(), blockLines[k].trim()) >= 0.8) highSimilarityCount++
    }
    if (highSimilarityCount >= patternLineCount * 0.5) {
      matches.push(calculateLinePositions(contentLines, i, i + patternLineCount, content.length))
    }
  }
  return matches
}

// ── 守卫：escape drift 检测 ──

function detectEscapeDrift(content: string, matches: MatchSpan[], oldString: string, newString: string): string | null {
  const matchedRegion = matches.map(([s, e]) => content.slice(s, e)).join('')
  const suspects = ['\\\'', '\\"']
  for (const seq of suspects) {
    if (newString.includes(seq) && oldString.includes(seq) && !matchedRegion.includes(seq)) {
      return (
        `Escape-drift guard: found '${seq}' in both old_string and new_string but not in the matched file region. `
        + 'This looks like tool-call serialization drift — the model typed a quote and the transport added a stray backslash. '
        + 'Please re-read the file and retry with the literal quote character.'
      )
    }
  }
  return null
}

// ── 条件反转义（\\t / \\r，仅当匹配区域含真实控制字符）──

function maybeUnescapeNewString(newString: string, content: string, matches: MatchSpan[]): string {
  if (!newString.includes('\\t') && !newString.includes('\\r')) return newString
  const matchedRegions = matches.map(([s, e]) => content.slice(s, e)).join('')
  let out = newString
  if (out.includes('\\t') && matchedRegions.includes('\t')) out = out.split('\\t').join('\t')
  if (out.includes('\\r') && matchedRegions.includes('\r')) out = out.split('\\r').join('\r')
  return out
}

// ── Unicode 保留（策略 7 命中时）──

function preserveUnicodeInReplacement(content: string, matches: MatchSpan[], oldString: string, newString: string): string {
  const fileRegion = matches.map(([s, e]) => content.slice(s, e)).join('')
  const normOld = unicodeNormalize(oldString)
  const normFile = unicodeNormalize(fileRegion)
  if (normOld !== normFile) return newString

  const fileOrigToNorm = buildOrigToNormMap(fileRegion)
  const fileNormToOrig: Record<number, number> = {}
  for (let origPos = 0; origPos < fileOrigToNorm.length - 1; origPos++) {
    const np = fileOrigToNorm[origPos]
    if (!(np in fileNormToOrig)) fileNormToOrig[np] = origPos
  }

  const opcodes = getOpcodes(normOld, newString)
  const resultParts: string[] = []
  for (const op of opcodes) {
    if (op.tag === 'equal') {
      const origStart = fileNormToOrig[op.i1] ?? 0
      let origEnd = origStart
      while (origEnd < fileRegion.length && (fileOrigToNorm[origEnd] ?? Infinity) < op.i2) origEnd++
      resultParts.push(fileRegion.slice(origStart, origEnd))
    } else if (op.tag === 'replace') {
      resultParts.push(newString.slice(op.j1, op.j2))
    } else if (op.tag === 'delete') {
      // skip
    } else if (op.tag === 'insert') {
      resultParts.push(newString.slice(op.j1, op.j2))
    }
  }
  return resultParts.join('')
}

// ── 缩进重对齐（非精确策略命中时）──

function leadingWhitespace(line: string): string {
  const m = /^[ \t]*/.exec(line)
  return m ? m[0] : ''
}

function firstMeaningfulLine(s: string): string | null {
  for (const line of s.split('\n')) {
    if (line.trim()) return line
  }
  return null
}

function reindentReplacement(fileRegion: string, oldString: string, newString: string): string {
  if (!newString) return newString
  const oldFirst = firstMeaningfulLine(oldString)
  const fileFirst = firstMeaningfulLine(fileRegion)
  if (oldFirst === null || fileFirst === null) return newString
  const oldIndent = leadingWhitespace(oldFirst)
  const fileIndent = leadingWhitespace(fileFirst)
  if (oldIndent === fileIndent) return newString

  const outLines: string[] = []
  for (const line of newString.split('\n')) {
    if (!line.trim()) { outLines.push(line); continue }
    const lineIndent = leadingWhitespace(line)
    if (lineIndent.startsWith(oldIndent)) {
      outLines.push(fileIndent + line.slice(oldIndent.length))
    } else {
      outLines.push(fileIndent + line.replace(/^[ \t]+/, ''))
    }
  }
  return outLines.join('\n')
}

// ── 应用替换 ──

function applyReplacements(content: string, matches: MatchSpan[], newString: string, oldString?: string | null): string {
  const sortedMatches = [...matches].sort((a, b) => b[0] - a[0])
  let result = content
  for (const [start, end] of sortedMatches) {
    let adjusted: string
    if (oldString !== undefined && oldString !== null) {
      const fileRegion = content.slice(start, end)
      adjusted = reindentReplacement(fileRegion, oldString, newString)
    } else {
      adjusted = newString
    }
    result = result.slice(0, start) + adjusted + result.slice(end)
  }
  return result
}

// ── 主入口──

export function fuzzyFindAndReplace(content: string, oldString: string, newString: string, replaceAll: boolean = false): FuzzyResult {
  if (!oldString) return { content, matchCount: 0, strategy: null, error: 'old_string cannot be empty' }
  if (oldString === newString) return { content, matchCount: 0, strategy: null, error: 'old_string and new_string are identical' }

  const strategies: Array<[string, (c: string, p: string) => MatchSpan[]]> = [
    ['exact', strategyExact],
    ['line_trimmed', strategyLineTrimmed],
    ['whitespace_normalized', strategyWhitespaceNormalized],
    ['indentation_flexible', strategyIndentationFlexible],
    ['escape_normalized', strategyEscapeNormalized],
    ['trimmed_boundary', strategyTrimmedBoundary],
    ['unicode_normalized', strategyUnicodeNormalized],
    ['block_anchor', strategyBlockAnchor],
    ['context_aware', strategyContextAware]
  ]

  for (const [strategyName, strategyFn] of strategies) {
    const matches = strategyFn(content, oldString)
    if (matches.length > 0) {
      if (matches.length > 1 && !replaceAll) {
        return {
          content, matchCount: 0, strategy: null,
          error: `Found ${matches.length} matches for old_string. Provide more context to make it unique, or use replace_all=True.`
        }
      }
      if (strategyName !== 'exact') {
        const driftErr = detectEscapeDrift(content, matches, oldString, newString)
        if (driftErr) return { content, matchCount: 0, strategy: null, error: driftErr }
      }
      let effectiveNew = maybeUnescapeNewString(newString, content, matches)
      if (strategyName === 'unicode_normalized') {
        effectiveNew = preserveUnicodeInReplacement(content, matches, oldString, effectiveNew)
      }
      const newContent = applyReplacements(
        content, matches, effectiveNew,
        strategyName !== 'exact' ? oldString : null
      )
      return { content: newContent, matchCount: matches.length, strategy: strategyName, error: null }
    }
  }
  return { content, matchCount: 0, strategy: null, error: 'Could not find a match for old_string in the file' }
}

// ── "Did you mean" 提示──

export function findClosestLines(oldString: string, content: string, contextLines: number = 2, maxResults: number = 3): string {
  if (!oldString || !content) return ''
  const oldLines = oldString.split(/\r?\n/)
  const contentLines = content.split(/\r?\n/)
  if (oldLines.length === 0 || contentLines.length === 0) return ''

  const candidates: Array<{ score: number; start: number }> = []
  const probe = oldLines.slice(0, Math.min(3, oldLines.length)).join('\n')
  for (let i = 0; i < contentLines.length; i++) {
    const windowLines = contentLines.slice(i, i + oldLines.length)
    const window = windowLines.join('\n')
    const score = sequenceRatio(probe, window)
    candidates.push({ score, start: i })
  }
  candidates.sort((a, b) => b.score - a.score)
  const top = candidates.slice(0, maxResults)

  const parts: string[] = []
  for (const c of top) {
    const start = Math.max(0, c.start - contextLines)
    const end = Math.min(contentLines.length, c.start + oldLines.length + contextLines)
    const excerpt = contentLines.slice(start, end).map(l => `  ${l}`).join('\n')
    parts.push(`  Line ${c.start + 1}:\n${excerpt}`)
  }
  return parts.join('\n\n')
}

export function formatNoMatchHint(error: string | null, matchCount: number, oldString: string, content: string): string {
  const hint = findClosestLines(oldString, content)
  if (!hint) return ''
  return `\n\nDid you mean one of these sections?\n${hint}`
}
