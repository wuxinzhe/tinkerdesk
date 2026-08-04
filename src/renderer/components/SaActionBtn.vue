<template>
  <button
    :class="['sa-action-btn', `sa-action-btn--${variant}`, {
      'sa-action-btn--loading': loading,
      'sa-action-btn--done': done,
    }]"
    :disabled="loading || done || disabled"
    @click="$emit('click')"
  >
    <svg v-if="loading" class="sa-action-btn__spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" />
    </svg>
    <svg v-else-if="done" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
    <span><slot>{{ loading ? loadingText || '处理中…' : done ? doneText || '已完成' : text || '确认' }}</slot></span>
  </button>
</template>

<script setup lang="ts">
export type SaActionBtnVariant = 'outline' | 'primary'

interface SaActionBtnProps {
  text?: string
  loading?: boolean
  loadingText?: string
  done?: boolean
  doneText?: string
  disabled?: boolean
  variant?: SaActionBtnVariant
}

withDefaults(defineProps<SaActionBtnProps>(), {
  variant: 'outline',
})

defineEmits<{ click: [] }>()
</script>

<style scoped>
.sa-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--sa-accent, #007aff);
  border-radius: 6px;
  background: var(--sa-bg-primary, #fff);
  color: var(--sa-accent, #007aff);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  white-space: nowrap;
}
.sa-action-btn:hover:not(:disabled) {
  background: var(--sa-accent, #007aff);
  color: #fff;
}
.sa-action-btn:disabled {
  cursor: default;
  opacity: 0.6;
}
.sa-action-btn--loading {
  opacity: 0.7;
  pointer-events: none;
}
.sa-action-btn--done {
  border-color: var(--sa-border, #d2d2d7);
  color: var(--sa-text-tertiary, #aeaeb2);
  background: var(--sa-bg-secondary, #f5f5f7);
}
.sa-action-btn--primary {
  background: var(--sa-accent, #007aff);
  border-color: var(--sa-accent, #007aff);
  color: #fff;
}
.sa-action-btn--primary:hover:not(:disabled) {
  opacity: 0.85;
  background: var(--sa-accent, #007aff);
  border-color: var(--sa-accent, #007aff);
  color: #fff;
}
.sa-action-btn--primary:disabled {
  opacity: 0.5;
}
@keyframes sa-action-spin {
  to { transform: rotate(360deg); }
}
.sa-action-btn__spinner {
  animation: sa-action-spin 1s linear infinite;
}
</style>
