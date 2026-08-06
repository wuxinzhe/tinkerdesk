/**
 * utils/html-utils.ts — HTML 处理工具
 *
 * - stripTags：剥离 HTML 标签并解码常见实体（从 web-search/web-extract 工具抽取）
 */

/** 剥离 HTML 标签 + 解码常见实体（&amp;/&quot;/&#39;） */
export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
}
