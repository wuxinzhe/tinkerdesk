/**
 * utils/html-utils.ts — HTML 处理工具
 *
 * - stripTags: strips HTML tags and decodes common entities (extracted from web-search/web-extract tools)
 */

/** 剥离 HTML 标签 + 解码常见实体（&amp;/&quot;/&#39;） */
export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
}
