<template>
  <div class="markdown-body" :style="{ '--code-block-bg': codeBlockBg }" v-html="rendered" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Marked } from '@/renderer/utils/markdown-utils'
import { convertTablesToCards } from '@/renderer/utils/convert-tables-to-cards'
import { useMobile } from '@/renderer/composables/use-mobile'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

const props = withDefaults(defineProps<{
  /** Markdown 原文 */
  content: string
  /** 是否渲染可点击的链接（默认：纯文本） */
  renderLinks?: boolean
  /** 是否启用代码高亮（默认：否，适用于技能详情等静态内容） */
  highlightCode?: boolean
  /** 是否将单一换行解析为 <br>（默认：否） */
  breaks?: boolean
  /** 代码块背景色（默认：#fff） */
  codeBlockBg?: string
}>(), {
  content: '',
  renderLinks: false,
  highlightCode: false,
  breaks: false,
  codeBlockBg: 'var(--sa-bg-tertiary, #fafafa)',
})

const isMobile = useMobile()

let _marked: Marked | null = null

function getMarked(): Marked {
  if (_marked) return _marked
  _marked = new Marked({
    renderer: {
      link({ href, text }: { href: string; text: string }) {
        if (!props.renderLinks) return text
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`
      },
      code({ text, lang }: { text: string; lang?: string }) {
        if (!props.highlightCode) return false
        const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
        const highlighted = hljs.highlight(text, { language }).value
        return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
      },
    },
  })
  return _marked
}

const rendered = computed(() => {
  if (!props.content) return ''
  const marked = getMarked()
  try {
    const opts = props.breaks ? { breaks: true } : undefined
    let html = marked.parse(props.content, opts) as string
    if (isMobile.value) {
      html = convertTablesToCards(html)
    }
    return html
  } catch {
    return props.content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }
})
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════
   Markdown 正文渲染 — 统一样式
   通过 :deep() 穿透 v-html 插入的 DOM
   ═══════════════════════════════════════════════════════ */

.markdown-body {
  font-size: 13px;
  line-height: 1.7;
  color: var(--sa-text-primary, #1d1d1f);
  overflow-wrap: break-word;
  word-wrap: break-word;
  word-break: break-word;
}

.markdown-body :deep(> :first-child) { margin-top: 0; }
.markdown-body :deep(> :last-child) { margin-bottom: 0; }

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin: 1.2em 0 0.5em;
  font-weight: 600;
  line-height: 1.3;
  color: var(--sa-text-primary, #1d1d1f);
}

.markdown-body :deep(h1) { font-size: 18px; }
.markdown-body :deep(h2) { font-size: 16px; }
.markdown-body :deep(h3) { font-size: 14px; }
.markdown-body :deep(h4) { font-size: 13px; }

.markdown-body :deep(p) {
  margin: 0.6em 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.8em;
}

.markdown-body :deep(li) {
  margin: 0.3em 0;
}

.markdown-body :deep(blockquote) {
  margin: 0.6em 0;
  padding: 6px 12px;
  border-left: 3px solid var(--sa-accent, #007aff);
  color: var(--sa-text-secondary, #86868b);
  background: rgba(0, 122, 255, 0.04);
  border-radius: 0 6px 6px 0;
}

.markdown-body :deep(a) {
  color: var(--sa-accent, #007aff);
  text-decoration: none;
  word-break: break-all;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--sa-border, #d2d2d7);
  margin: 1.2em 0;
}

.markdown-body :deep(code) {
  font-size: 12px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
  padding: 2px 5px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.06);
  color: #d63384;
}

html[data-theme='dark'] .markdown-body :deep(code) {
  background: rgba(255, 255, 255, 0.1);
  color: #ff7ab2;
}

.markdown-body :deep(pre) {
  margin: 0.8em 0;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  background: var(--code-block-bg, var(--sa-bg-tertiary, #fafafa));
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  font-size: 12px;
  line-height: 1.5;
}

.markdown-body :deep(pre code.hljs) {
  background: none;
  padding: 0;
}

/* ── 深色：hljs 高亮切换 github-dark 配色（浅色走 github.css） ── */
html[data-theme='dark'] .markdown-body :deep(pre code.hljs) {
  color: #c9d1d9;
}
html[data-theme='dark'] .markdown-body :deep(.hljs-keyword),
html[data-theme='dark'] .markdown-body :deep(.hljs-selector-tag),
html[data-theme='dark'] .markdown-body :deep(.hljs-literal) { color: #ff7b72; }
html[data-theme='dark'] .markdown-body :deep(.hljs-string),
html[data-theme='dark'] .markdown-body :deep(.hljs-regexp),
html[data-theme='dark'] .markdown-body :deep(.hljs-addition) { color: #a5d6ff; }
html[data-theme='dark'] .markdown-body :deep(.hljs-comment),
html[data-theme='dark'] .markdown-body :deep(.hljs-quote) { color: #8b949e; font-style: italic; }
html[data-theme='dark'] .markdown-body :deep(.hljs-number),
html[data-theme='dark'] .markdown-body :deep(.hljs-symbol),
html[data-theme='dark'] .markdown-body :deep(.hljs-bullet) { color: #79c0ff; }
html[data-theme='dark'] .markdown-body :deep(.hljs-title),
html[data-theme='dark'] .markdown-body :deep(.hljs-section),
html[data-theme='dark'] .markdown-body :deep(.hljs-function .hljs-title) { color: #d2a8ff; }
html[data-theme='dark'] .markdown-body :deep(.hljs-attr),
html[data-theme='dark'] .markdown-body :deep(.hljs-variable),
html[data-theme='dark'] .markdown-body :deep(.hljs-template-variable) { color: #79c0ff; }
html[data-theme='dark'] .markdown-body :deep(.hljs-tag),
html[data-theme='dark'] .markdown-body :deep(.hljs-name),
html[data-theme='dark'] .markdown-body :deep(.hljs-deletion) { color: #7ee787; }
html[data-theme='dark'] .markdown-body :deep(.hljs-type),
html[data-theme='dark'] .markdown-body :deep(.hljs-built_in),
html[data-theme='dark'] .markdown-body :deep(.hljs-params) { color: #ffa657; }
html[data-theme='dark'] .markdown-body :deep(.hljs-meta) { color: #ffa657; }
html[data-theme='dark'] .markdown-body :deep(.hljs-operator),
html[data-theme='dark'] .markdown-body :deep(.hljs-property) { color: #ff7b72; }
html[data-theme='dark'] .markdown-body :deep(.hljs-emphasis) { font-style: italic; }
html[data-theme='dark'] .markdown-body :deep(.hljs-strong) { font-weight: 700; }

/* ── Table ── */

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.8em 0;
  font-size: 12px;
  background: var(--sa-bg-elevated, #ffffff);
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 8px 10px;
  border: 1px solid var(--sa-border, #e8e8ed);
  text-align: left;
  vertical-align: top;
  background: var(--sa-bg-elevated, #ffffff);
}

.markdown-body :deep(th) {
  background: var(--sa-bg-secondary, #f5f5f7);
  font-weight: 600;
}

/* ── 移动端表格转卡片（由 convertTablesToCards 生成） ── */

.markdown-body :deep(.table-cards) {
  margin: 0.6em 0;
}

.markdown-body :deep(.table-card) {
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 8px;
  padding: 12px 24px 12px 16px;
  margin-bottom: 8px;
  position: relative;
  background: var(--sa-bg-primary, #fff);
}

.markdown-body :deep(.table-card__num) {
  position: absolute;
  top: -1px;
  right: -1px;
  font-size: 10px;
  font-weight: 600;
  color: var(--sa-text-tertiary, #aeaeb2);
  line-height: 1;
  min-width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sa-bg-tertiary, #e8e8ed);
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 0 8px 0 8px;
}

.markdown-body :deep(.table-card__row) {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  padding: 3px 0;
}

.markdown-body :deep(.table-card__row + .table-card__row) {
  border-top: 1px solid var(--sa-border-light, #e8e8ed);
  margin-top: 2px;
  padding-top: 5px;
}

.markdown-body :deep(.table-card__label) {
  font-size: 11px;
  font-weight: 600;
  color: var(--sa-text-tertiary, #aeaeb2);
  white-space: nowrap;
  flex-shrink: 0;
}

.markdown-body :deep(.table-card__value) {
  font-size: 12px;
  color: var(--sa-text-primary, #1d1d1f);
  text-align: right;
  word-break: break-word;
}

/* 手机模式：卡片区折叠 */
@media (max-width: 767px) {
  .markdown-body :deep(.table-cards) {
    position: relative;
    margin: 0.6em 0;
  }
  .markdown-body :deep(.table-cards__body) {
    max-height: calc(2.5 * (32px + 2.5em));
    overflow-y: auto;
    scrollbar-width: none;
  }
  .markdown-body :deep(.table-cards__body::-webkit-scrollbar) {
    display: none;
  }
  .markdown-body :deep(.table-cards__toggle) {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .markdown-body :deep(.table-cards__trigger) {
    display: block;
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    padding: 6px 0 2px;
    color: var(--sa-accent, #007aff);
    cursor: pointer;
    user-select: none;
  }
  .markdown-body :deep(.table-cards__trigger)::before {
    content: '展开全部';
  }
  .markdown-body :deep(.table-cards__toggle:checked ~ .table-cards__body) {
    max-height: none;
  }
  .markdown-body :deep(.table-cards__toggle:checked ~ .table-cards__trigger)::before {
    content: '收起';
  }
}
</style>
