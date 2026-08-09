<template>
  <div class="sa-empty">
    <div v-if="$slots.icon || icon" class="sa-empty__icon">
      <slot name="icon">
        <svg v-if="icon === 'search'" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <svg v-else-if="icon === 'box'" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
        <svg v-else-if="icon === 'person'" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
        </svg>
        <svg v-else-if="icon === 'chat'" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        <svg v-else-if="icon === 'tool'" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </svg>
      </slot>
    </div>
    <p v-if="text" class="sa-empty__text">{{ text }}</p>
    <p v-if="hint" class="sa-empty__hint">{{ hint }}</p>
    <div v-if="$slots.actions" class="sa-empty__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
interface SaEmptyProps {
  icon?: 'search' | 'box' | 'person' | 'chat' | 'tool'
  text?: string
  hint?: string
}

defineProps<SaEmptyProps>()
</script>

<style scoped>
.sa-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 24px;
  color: var(--tk-text-tertiary);
  text-align: center;
}
.sa-empty__icon {
  /* emil：图标放入柔和圆角容器——具象而非干瘪线条 */
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-tertiary);
  opacity: 1;
  margin-bottom: 6px;
}
.sa-empty__text {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--tk-text-primary);
}
.sa-empty__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  max-width: 320px;
}
.sa-empty__actions {
  margin-top: 10px;
}
</style>
