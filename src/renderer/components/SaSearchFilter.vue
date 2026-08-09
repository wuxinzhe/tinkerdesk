<template>
  <div class="sa-search-filter">
    <!-- Search input — 桌面端第一项，移动端通栏 -->
    <div class="sa-search-filter__search-wrap">
      <svg class="sa-search-filter__search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        v-model="localQuery"
        class="sa-search-filter__search"
        :placeholder="placeholder || '搜索'"
        @input="onSearch"
      />
    </div>

    <!-- Category select + Count — 移动端第二栏 -->
    <select v-if="categories?.length" v-model="localCategory" class="sa-search-filter__select" @change="onFilter">
      <option value="">
        全部分类
      </option>
      <option v-for="cat in categories" :key="cat.id || cat.name " :value="cat.name || cat">
        {{ cat.displayName || cat }}
      </option>
    </select>

    <!-- Count -->
    <span v-if="total != null" class="sa-search-filter__count">共 {{ total }} 个</span>

    <!-- Extra actions -->
    <slot />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { SkillCategory } from '@/renderer/api/types'

const props = withDefaults(defineProps<{
  categories?: SkillCategory[]
  total?: number
  placeholder?: string
  modelValue?: { category?: string; query?: string }
}>(), {})

const emit = defineEmits<{
  'update:modelValue': [value: { category?: string; query?: string }]
  change: []
}>()

const localCategory = ref(props.modelValue?.category ?? '')
const localQuery = ref(props.modelValue?.query ?? '')
let timer: ReturnType<typeof setTimeout> | null = null

function emitChange() {
  emit('update:modelValue', { category: localCategory.value || undefined, query: localQuery.value || undefined })
  emit('change')
}

function onFilter() {
  emitChange()
}

function onSearch() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(emitChange, 300)
}

watch(() => props.modelValue, (v) => {
  if (v) {
    if (v.category !== undefined && v.category !== localCategory.value) localCategory.value = v.category
    if (v.query !== undefined && v.query !== localQuery.value) localQuery.value = v.query
  }
}, { deep: true })
</script>

<style scoped>
.sa-search-filter {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 767px) {
  .sa-search-filter__search-wrap {
    width: 100%;
  }
  .sa-search-filter__search {
    width: 100%;
    font-size: 16px; /* iOS 防止自动缩放 */
  }
}
.sa-search-filter__select {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--tk-border-light);
  border-radius: 6px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-primary);
  font-size: 12px;
  outline: none;
  cursor: pointer;
  min-width: 120px;
  font-family: inherit;
}
.sa-search-filter__search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.sa-search-filter__search-icon {
  position: absolute;
  left: 8px;
  color: var(--tk-text-tertiary);
  pointer-events: none;
}
.sa-search-filter__search {
  height: 30px;
  padding: 0 10px 0 26px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-primary);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  width: 180px;
  transition: all 0.2s;
}
.sa-search-filter__search:focus {
  border-color: var(--tk-accent);
  background: var(--tk-bg-primary);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}
.sa-search-filter__search::placeholder {
  color: var(--tk-text-tertiary);
}
.sa-search-filter__count {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  margin-left: auto;
}
</style>
