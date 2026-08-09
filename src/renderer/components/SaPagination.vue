<template>
  <div v-if="totalPages > 1" class="sa-pagination">
    <button
      class="sa-pagination__btn"
      :disabled="modelValue <= 1"
      @click="$emit('update:modelValue', modelValue - 1)"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
    <span class="sa-pagination__info">{{ modelValue }} / {{ totalPages }}</span>
    <button
      class="sa-pagination__btn"
      :disabled="modelValue >= totalPages"
      @click="$emit('update:modelValue', modelValue + 1)"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: number
  total: number
  pageSize?: number
}>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / (props.pageSize || 20))))
</script>

<style scoped>
.sa-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px 0;
  flex-shrink: 0;
}
.sa-pagination__btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--tk-border);
  border-radius: 6px;
  background: var(--tk-bg-primary);
  color: var(--tk-text-primary);
  cursor: pointer;
  transition: background 0.12s;
}
.sa-pagination__btn:hover:not(:disabled) {
  background: var(--tk-bg-secondary);
}
.sa-pagination__btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.sa-pagination__info {
  font-size: 12px;
  color: var(--tk-text-secondary);
  min-width: 60px;
  text-align: center;
}
</style>
