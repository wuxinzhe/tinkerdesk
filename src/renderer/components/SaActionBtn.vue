<template>
  <button
    :class="['sa-action-btn', `sa-action-btn--${variant}`, `sa-action-btn--${size}`, {
      'sa-action-btn--loading': loading,
      'sa-action-btn--done': done,
    }]"
    :disabled="loading || done || disabled"
    @click="$emit('click', $event)"
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
export type SaActionBtnVariant = 'subtle' | 'outline' | 'primary' | 'danger'
export type SaActionBtnSize = 's' | 'm' | 'l'

interface SaActionBtnProps {
  text?: string
  loading?: boolean
  loadingText?: string
  done?: boolean
  doneText?: string
  disabled?: boolean
  variant?: SaActionBtnVariant
  size?: SaActionBtnSize
}

withDefaults(defineProps<SaActionBtnProps>(), {
  variant: 'subtle',
  size: 'm',
})

defineEmits<{ click: [event: MouseEvent] }>()
</script>

<style scoped>
/* ── Apple HIG Buttons：subtle 次要 / primary 填充 / danger 红字 ── */
.sa-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: var(--tk-control-m);
  padding: 0 12px;
  border: none;
  border-radius: var(--tk-radius-md);
  background: transparent;
  color: var(--tk-accent);
  font-size: var(--tk-fs-body);
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s var(--tk-ease);
  white-space: nowrap;
}

/* ── 尺寸档 ── */
.sa-action-btn--s {
  height: var(--tk-control-s);
  padding: 0 8px;
  font-size: 12px;
}
.sa-action-btn--l {
  height: var(--tk-control-l);
  padding: 0 16px;
}

/* ── subtle（默认——次要按钮，无边框无背景） ── */
.sa-action-btn--subtle:hover:not(:disabled) {
  background: rgba(0, 122, 255, 0.08);
}

/* ── outline（需要边界感时使用——hover 不填充） ── */
.sa-action-btn--outline {
  border: 1px solid var(--tk-border);
  color: var(--tk-text-primary);
  background: var(--tk-bg-primary);
}
.sa-action-btn--outline:hover:not(:disabled) {
  background: var(--tk-bg-secondary);
  border-color: var(--tk-text-quaternary);
}

/* ── primary（主操作——solid 填充） ── */
.sa-action-btn--primary {
  background: var(--tk-accent);
  color: #ffffff;
}
.sa-action-btn--primary:hover:not(:disabled) {
  background: var(--tk-accent-hover);
}

/* ── danger（危险操作——红字无边框） ── */
.sa-action-btn--danger {
  color: var(--tk-destructive);
}
.sa-action-btn--danger:hover:not(:disabled) {
  background: rgba(255, 59, 48, 0.08);
}

.sa-action-btn:disabled {
  cursor: default;
  opacity: 0.5;
}
.sa-action-btn--loading {
  opacity: 0.7;
  pointer-events: none;
}
.sa-action-btn--done {
  color: var(--tk-text-tertiary);
  background: var(--tk-bg-secondary);
}
@keyframes sa-action-spin {
  to { transform: rotate(360deg); }
}
.sa-action-btn__spinner {
  animation: sa-action-spin 1s linear infinite;
}
</style>
