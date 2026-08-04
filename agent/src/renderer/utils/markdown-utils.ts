/**
 * markdown-utils.ts — Markdown 渲染共享工具
 *
 * 集中管理 marked 相关配置，避免两个视图各自 import 'marked'。
 *
 * 使用方：
 *   - SkillDetailView.vue — 技能详情正文渲染（隔离实例，link 转纯文本）
 *   - MessageBubbleComponent.vue — 聊天气泡渲染（全局配置 + highlight.js）
 */

import { Marked } from 'marked'

/** 技能详情专用的 Marked 实例：link 渲染为纯文本不可点击 */
export const skillMarked = new Marked({
  renderer: {
    link({ text }: { text: string }) {
      return text
    }
  }
})

/** 将普通文本中的 HTML 特殊字符转义 */
export function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export { Marked }
