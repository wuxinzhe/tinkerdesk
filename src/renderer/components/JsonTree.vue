<template>
  <div class="json-tree">
    <template v-for="(entry, i) in entries" :key="i">
      <div class="json-tree__row" :style="{ paddingLeft: `${(depth ?? 0) * 16}px` }">
        <button
          v-if="isObj(entry.v)"
          class="json-tree__toggle"
          :aria-expanded="entry.open"
          @click="toggleEntry(entry)"
        >
          <svg
            class="json-tree__chevron"
            :class="{ 'json-tree__chevron--open': entry.open }"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <span v-else class="json-tree__toggle json-tree__toggle--empty" />
        <span class="json-tree__key">{{ entry.k }}</span>
        <span v-if="isObj(entry.v)" class="json-tree__meta">
          {{ Array.isArray(entry.v) ? `Array(${entry.v.length})` : `Object(${Object.keys(entry.v as object).length})` }}
        </span>
        <span v-else class="json-tree__val" :class="`json-tree__val--${valType(entry.v)}`">{{ valText(entry.v) }}</span>
      </div>
      <template v-if="isObj(entry.v) && entry.open">
        <JsonTree :value="entry.v" :depth="(depth ?? 0) + 1" />
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * JSON 树形展示组件（递归）：
 * - 对象/数组层级缩进，可折叠（默认展开）
 * - ⚠ 折叠状态存组件级 reactive Map（不能用 computed 临时对象——非响应式赋值不触发重渲染）
 * - 原始值按类型着色：字符串(绿+引号) / 数字(蓝) / 布尔(橙) / null(灰)
 * - 嵌套 JSON 字符串（如 toolCall.arguments = "{\"query\":...}"）自动二次解析展开
 */
import { computed, reactive } from 'vue'
import { deepParseJson } from '@/renderer/utils/json-utils'

defineOptions({ name: 'JsonTree' })

const props = defineProps<{
  value: unknown
  depth?: number
}>()

interface Entry {
  k: string
  v: unknown
  open: boolean
}

/** 折叠状态（组件实例级）——key = 条目在 entries 中的位置 */
const openState = reactive(new Map<number, boolean>())

const parsed = computed<unknown>(() => deepParseJson(props.value))

const entries = computed<Entry[]>(() => {
  const v = parsed.value
  if (Array.isArray(v)) {
    return v.map((item, i) => ({ k: String(i), v: item, open: openState.get(i) ?? true }))
  }
  if (v && typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>).map(([k, val], i) => ({
      k,
      v: val,
      open: openState.get(i) ?? true,
    }))
  }
  return []
})

function toggleEntry(entry: Entry): void {
  const i = entries.value.indexOf(entry)
  if (i === -1) return
  openState.set(i, !(openState.get(i) ?? true))
}

function isObj(v: unknown): boolean {
  return v !== null && typeof v === 'object'
}

function valType(v: unknown): string {
  if (v === null) return 'null'
  if (typeof v === 'string') return 'string'
  if (typeof v === 'number') return 'number'
  if (typeof v === 'boolean') return 'boolean'
  return 'other'
}

function valText(v: unknown): string {
  if (v === null) return 'null'
  if (typeof v === 'string') return JSON.stringify(v)
  return String(v)
}
</script>

<style scoped>
.json-tree {
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.7;
}

.json-tree__row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-height: 20px;
  /* 不 nowrap：多组工具调用时行内换行，避免第二组被横向 overflow 隐藏 */
  white-space: pre-wrap;
  word-break: break-all;
}

.json-tree__toggle {
  flex-shrink: 0;
  width: 16px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--tk-text-tertiary);
  cursor: pointer;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.json-tree__toggle--empty {
  cursor: default;
}

.json-tree__chevron {
  transition: transform 220ms cubic-bezier(0.23, 1, 0.32, 1);
}

.json-tree__chevron--open {
  transform: rotate(180deg);
}

.json-tree__key {
  color: var(--tk-accent);
  font-weight: 500;
  flex-shrink: 0;
}

.json-tree__meta {
  color: var(--tk-text-tertiary);
  font-size: 11px;
  flex-shrink: 0;
}

.json-tree__val {
  word-break: break-all;
  white-space: pre-wrap;
}

.json-tree__val--string { color: var(--tk-success); }
.json-tree__val--number { color: var(--tk-accent); }
.json-tree__val--boolean { color: var(--tk-warning); }
.json-tree__val--null { color: var(--tk-text-tertiary); font-style: italic; }
</style>
