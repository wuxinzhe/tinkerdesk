/**
 * markdown-to-text.ts — Markdown → 纯文本
 *
 * TTS 朗读前清洗：去掉 markdown 格式语法，保留可读文本语义。
 * 特殊规则：表格（表头/分隔行/单元格内容）整体删除——TTS 无法朗读表格。
 */

/** 表格块（连续以 | 开头、| 结尾的行——含分隔行）——整体替换为提示文案 */
const TABLE_BLOCK_RE = /(?:^[ \t]*\|.*\|[ \t]*\n?)+/gm

/** 表格替换文案（TTS 朗读时告知用户有表格） */
const TABLE_PLACEHOLDER = '相关数据已整理成表格'

/** markdown → 纯文本（TTS 朗读用——去格式保留语义；表格整体替换为提示文案） */
export function markdownToPlainText(md: string): string {
  if (!md) return ''
  // 归一化换行（Windows \r\n → \n——否则行尾 \r 卡住 $ 锚点，表格/分隔线删不掉）
  let text = md.replace(/\r\n/g, '\n')

  // 1. 表格块整体替换（表头/分隔行/单元格全变一句话——TTS 不逐格朗读）
  text = text.replace(TABLE_BLOCK_RE, TABLE_PLACEHOLDER)

  // 2. 代码块 → 整体替换为提示文案（TTS 不朗读代码内容）
  text = text.replace(/```[\s\S]*?```/g, '相关脚本已整理成代码')

  // 3. 行内代码 → 内容
  text = text.replace(/`([^`]*)`/g, '$1')

  // 4. 标题 → 文本
  text = text.replace(/^#{1,6}[ \t]+/gm, '')

  // 5. 粗体/斜体 → 内容（** / * / __ / _）
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
  text = text.replace(/\*([^*]+)\*/g, '$1')
  text = text.replace(/__([^_]+)__/g, '$1')
  text = text.replace(/_([^_]+)_/g, '$1')

  // 6. 链接/图片 → 保留文本（[text](url) → text；![alt](url) → alt）
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')

  // 7. 列表符号 → 去掉（- / * / + / 1.）
  text = text.replace(/^[ \t]*[-*+][ \t]+/gm, '')
  text = text.replace(/^[ \t]*\d+[.)][ \t]+/gm, '')

  // 8. 引用 → 去掉 >
  text = text.replace(/^>[ \t]?/gm, '')

  // 9. 分隔线（--- / *** / ___）→ 删
  text = text.replace(/^[ \t]*([-*_]){3,}[ \t]*$/gm, '')

  // 10. HTML 标签 → 删（保留内容）
  text = text.replace(/<[^>]+>/g, '')

  // 11. 转义字符还原
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, '$1')

  // 12. 空白整理（保留段落换行）
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}
