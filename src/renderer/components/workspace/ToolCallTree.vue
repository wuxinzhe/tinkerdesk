<template>
  <!-- 工具调用树状列表（SVG 扳手节点 + 细连线——纵向排列——顺序感：先调用的在上） -->
  <div
    v-for="(entry, i) in toolCallEntries"
    :key="i"
    class="tool-call-tree"
    :style="i === 0 ? { marginTop: `${firstGap}px` } : undefined"
  >
    <svg class="tool-call-tree__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
    </svg>
    <span>通过调用 <span class="tool-call-tree__name">{{ displayToolName(entry.name) }}</span> 工具解决问题...</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface ToolCallEntry { name?: string; arguments?: unknown }

const props = withDefaults(defineProps<{
  /** toolCall（map 结构 {callId:{name,arguments}} 或平铺 {id,name,arguments} 或 JSON string） */
  toolCall?: unknown
  /** 流式占位期工具名（toolCall 未拼时兜底单条） */
  toolCallName?: string
  /** 首行与上方内容的间距（纯工具无 content 时传 0） */
  firstGap?: number
}>(), {
  toolCall: undefined,
  toolCallName: '',
  firstGap: 16,
})

/** 解析 toolCall 为条目数组（兼容平铺 {id,name,arguments} 或 map {callId:{name,arguments}}） */
function parseToolCallEntries(raw: unknown): Array<{ id: string; name: string; arguments?: unknown }> {
  if (!raw) return []
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) } catch { return [] }
  }
  if (!parsed || typeof parsed !== 'object') return []
  const obj = parsed as Record<string, unknown>
  // 平铺结构（单工具）
  if (typeof obj.id === 'string' && typeof obj.name === 'string') {
    return [{ id: obj.id, name: obj.name, arguments: obj.arguments as unknown }]
  }
  // map 结构：{callId: {name, arguments}}
  return Object.entries(obj).map(([id, v]) => {
    const e = (v ?? {}) as ToolCallEntry
    return { id, name: typeof e.name === 'string' ? e.name : id, arguments: e.arguments }
  })
}

/** 工具名去前缀（desktop_tinker_terminal → terminal / builtin_tinker_clarify → clarify） */
function displayToolName(name: string): string {
  return name.replace(/^(desktop_tinker_|builtin_tinker_)/, '')
}

/** 工具条目（多工具各自一条；流式占位期 toolCall 未拼——用 toolCallName 字段兜底单条） */
const toolCallEntries = computed(() => {
  const entries = parseToolCallEntries(props.toolCall)
  if (entries.length > 0) return entries
  return props.toolCallName
    ? [{ id: '', name: props.toolCallName, arguments: undefined }]
    : []
})
</script>

<style scoped>
/* ── 工具调用树状列表（🔧 节点 + 细连线——纵向排列——顺序感：先调用的在上） ── */

.tool-call-tree {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  /* 首行 margin-top 由 firstGap prop 控制（style 绑定） */
  padding: 1px 8px 1px 24px;    /* 左侧留出竖线 + 横线 + 图标空间 */
  font-size: 12px;
  font-weight: 500;
  line-height: 1.6;
  color: var(--tk-text-tertiary);   /* 辅助信息——文字淡一些（工具名单独蓝色高亮） */
}

/* 工具行之间：小间距（不随正文间距增加） */
.tool-call-tree + .tool-call-tree {
  margin-top: 4px;
}

/* 垂直主干线（细淡——贯穿所有行） */
.tool-call-tree::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--tk-accent);
  opacity: 0.2;
}

/* 每行水平分支线（细淡——从竖线连到图标节点） */
.tool-call-tree::after {
  content: '';
  position: absolute;
  left: 8px;
  top: 50%;
  width: 8px;
  height: 1px;
  background: var(--tk-accent);
  opacity: 0.2;
}

/* 工具节点图标（SVG 扳手——accent 色，替代 emoji） */
.tool-call-tree__icon {
  flex-shrink: 0;
  color: var(--tk-accent);
  position: relative;
  z-index: 1;
}

/* 工具名（蓝色高亮） */
.tool-call-tree__name {
  color: var(--tk-accent);
  font-weight: 600;
}
</style>
