/**
 * utils/diff.ts — 文本 diff 工具
 *
 * 简单 unified diff 生成：
 * --- a/{path} / +++ b/{path} + 逐行 +/- 对比 + @@ 头。
 * 被 patch-tool 使用。
 */

/** 生成统一格式 diff（逐行对比，非 LCS 优化） */
export function unifiedDiff(oldContent: string, newContent: string, filePath: string): string {
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
