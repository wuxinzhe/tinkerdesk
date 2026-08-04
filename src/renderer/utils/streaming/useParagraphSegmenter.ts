/**
 * useParagraphSegmenter.ts — 流式文本分段器
 *
 * 将原始 token 缓冲区按段落 / 代码块边界切割。
 * 每次调用返回已封闭段落数组 + 剩余未封闭文本。
 *
 * 封闭规则：
 * - 空行结尾的段落（\n\n）→ 完整
 * - 闭合的代码块（```...```）→ 完整（兼容 ```lang 格式）
 * - 行内 markdown 标记闭合（** * ~~ ` 成对，忽略代码块内容）→ 完整
 * - 未闭合代码块 / 无空行结尾 / 行内标记未闭合 → 留在缓冲区
 */

export interface CompletedChunk {
  id: number
  text: string
}

/**
 * 检查行内 markdown 标记是否闭合（忽略代码块内容）。
 * 粗体 ** / 斜体 * / 删除线 ~~ / 行内代码 ` 必须成对出现。
 * 代码块（```...```）内部的内容不算 markdown 标记。
 */
function isInlineMarkdownBalanced(text: string): boolean {
  // 去掉代码块内容（代码块内的 **、*、` 等不算标记）
  const withoutCodeBlocks = text.replace(/```[\s\S]*?```/g, '')

  // 粗体 **：必须成对
  const boldCount = (withoutCodeBlocks.match(/\*\*/g) || []).length
  if (boldCount % 2 !== 0) return false

  // 斜体 *（剔除 ** 后剩下的单个 *）：必须成对
  const stripped = withoutCodeBlocks.replace(/\*\*/g, '')
  const italicCount = (stripped.match(/\*/g) || []).length
  if (italicCount % 2 !== 0) return false

  // 删除线 ~~
  const strikeCount = (withoutCodeBlocks.match(/~~/g) || []).length
  if (strikeCount % 2 !== 0) return false

  // 行内代码 `：必须成对
  const codeCount = (withoutCodeBlocks.match(/`/g) || []).length
  if (codeCount % 2 !== 0) return false

  return true
}

/**
 * 从缓冲区文本中提取已封闭段落。
 *
 * @param buffer    原始 token 累积文本
 * @param fromIndex 已检查到的位置（增量用，传 0 全量扫描）
 * @returns { chunks, rest, nextIndex }
 *   chunks     — 已封闭的段落数组
 *   rest       — 未封闭的剩余文本
 *   nextIndex  — 下次增量扫描的起始位置
 */
/**
 * 判断是否为块级行：表格行 |...| / 列表项 -、1. / 引用 >
 * 这类行组成的块（表格/列表/引用）必须整体提取，
 * 行之间不允许被 \n\n 断开（否则 Marked 表格/列表渲染断裂 → | ** 字面错乱）。
 */
function isBlockLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  // 表格行：以 | 开头（含流式中途截断的分隔行如 |---|---，此时行尾尚无 |）
  if (t.startsWith('|')) return true
  // 列表项：- / * / + / 数字.
  if (/^([-*+]|\d+\.)\s*/.test(t)) return true
  // 引用
  if (/^>\s?/.test(t)) return true
  return false
}

/** 判断段是否为纯块行段（每一行都是块级行） */
function isBlockSegment(seg: string): boolean {
  const lines = seg.trim().split('\n')
  return lines.length > 0 && lines.every(l => isBlockLine(l))
}

/**
 * 从缓冲区文本中提取已封闭段落。
 *
 * @param buffer    原始 token 累积文本
 * @param fromIndex 已检查到的位置（增量用，传 0 全量扫描）
 * @returns { chunks, rest, nextIndex }
 *   chunks     — 已封闭的段落数组
 *   rest       — 未封闭的剩余文本
 *   nextIndex  — 下次增量扫描的起始位置
 */
export function extractCompleted(
  buffer: string,
  fromIndex: number,
  chunkSeq: { nextId: number }
): { chunks: CompletedChunk[]; rest: string; nextIndex: number } {
  if (!buffer) return { chunks: [], rest: '', nextIndex: 0 }

  const chunks: CompletedChunk[] = []
  let rest = buffer
  let idx = fromIndex

  // 如果 fromIndex >= buffer 长度，说明没有新内容
  if (fromIndex >= buffer.length) {
    return { chunks: [], rest: buffer, nextIndex: fromIndex }
  }

  // 只扫描 fromIndex 之后的新增文本
  const newText = buffer.slice(fromIndex)

  // 1. 统计代码块
  const codeFenceCount = (buffer.match(/```/g) || []).length
  const codeBlockClosed = codeFenceCount % 2 === 0

  // 2. 按双换行切段
  const recentSegments = newText.split(/(?<=\n\n)/)

  // 处理最后一段可能无结尾换行
  let completedSegments: string[] = []
  let pendingSegment = ''

  if (recentSegments.length > 0) {
    const last = recentSegments[recentSegments.length - 1]
    // 如果最后一段以 \n\n 结尾 → 它是完整的
    if (last.endsWith('\n\n')) {
      completedSegments = recentSegments
      pendingSegment = ''
    } else if (recentSegments.length === 1) {
      // 只有一段且末尾不完整 → 全部待定
      pendingSegment = last
    } else {
      // 多段，最后一段未闭合 → 前面的完整
      completedSegments = recentSegments.slice(0, -1)
      pendingSegment = last
    }
  }

  // 3. 如果代码块未闭合，最后一段代码不能算完整
  let effectiveCompleted = completedSegments
  if (!codeBlockClosed) {
    // 去除最后一段可能包含未闭合 ``` 的分段
    // 向前回溯直到找到 ``` 开头的一段
    const temp = [...completedSegments]
    while (temp.length > 0) {
      const seg = temp[temp.length - 1]
      if (seg.includes('```')) {
        // 这一段包含代码块标记，不能算完整
        temp.pop()
        pendingSegment = seg + pendingSegment
        break
      }
      temp.pop()
      pendingSegment = seg + pendingSegment
    }
    effectiveCompleted = temp
  }

  // 3.25 表格/列表/引用块合并：
  // 块行之间不允许被 \n\n 断开（否则 Marked 表格/列表渲染断裂 → | ** 字面错乱）
  if (effectiveCompleted.length > 0) {
    // ① completedSegments 内部相邻块段合并（行间 \n\n → \n）
    const merged: string[] = []
    for (const seg of effectiveCompleted) {
      const last = merged[merged.length - 1]
      if (last && isBlockSegment(last) && isBlockSegment(seg)) {
        merged[merged.length - 1] = last.replace(/\n\n$/, '\n') + seg.replace(/^\s*\n/, '')
      } else {
        merged.push(seg)
      }
    }
    effectiveCompleted = merged
    // ② 末尾块段退回：块段不单独提取——pending 为空或同为块段时退回（等块结束确认）
    //    例：表头 `| 平台 | 账号 |\n\n` 单独到达时，后面可能还有 `|---|---|` 数据行，
    //    此时提取会切断表格——必须留在 buffer 等块完整（孤立块延迟到 isFinish flush，不丢失）
    const lastSeg = effectiveCompleted[effectiveCompleted.length - 1]
    if (lastSeg && isBlockSegment(lastSeg) && (pendingSegment === '' || isBlockSegment(pendingSegment))) {
      pendingSegment = effectiveCompleted.pop() + pendingSegment
    }
  }

  // 3.5 行内 markdown 闭合检查：从后往前找第一个行内标记未闭合的段，
  // 该段及之后的所有段退回缓冲区（等闭合标记到来），避免"半截 **"被渲染成裸文本
  // 块段（表格/列表/引用）跳过此检查——块完整性由 3.25 保证，表格单元格内的 ** 不应触发切段
  if (effectiveCompleted.length > 0) {
    let cutIndex = effectiveCompleted.length
    for (let i = effectiveCompleted.length - 1; i >= 0; i--) {
      if (isBlockSegment(effectiveCompleted[i])) continue
      if (!isInlineMarkdownBalanced(effectiveCompleted[i])) {
        cutIndex = i
        break
      }
    }
    if (cutIndex < effectiveCompleted.length) {
      const dropped = effectiveCompleted.slice(cutIndex)
      pendingSegment = dropped.join('') + pendingSegment
      effectiveCompleted = effectiveCompleted.slice(0, cutIndex)
    }
  }

  // 4. 组装 chunks
  for (const seg of effectiveCompleted) {
    const trimmed = seg.trim()
    if (trimmed) {
      chunks.push({ id: chunkSeq.nextId++, text: trimmed })
    }
  }

  // 5. 计算剩余
  const completedLen = effectiveCompleted.reduce((sum, s) => sum + s.length, 0)
  rest = buffer.slice(fromIndex + completedLen) || ''
  idx = buffer.length - rest.length

  return { chunks, rest, nextIndex: idx }
}
