<template>
  <span class="sa-badge" :class="[`sa-badge--${variant}`, { 'sa-badge--dot': dot }]">
    <slot>{{ text }}</slot>
  </span>
</template>

<script setup lang="ts">
export type SaBadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'frozen'

interface SaBadgeProps {
  text?: string
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'frozen'
  dot?: boolean
}

withDefaults(defineProps<SaBadgeProps>(), {
  variant: 'default',
  dot: false,
})
</script>

<style scoped>
.sa-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: 0.2px;
  white-space: nowrap;
  flex-shrink: 0;
}
.sa-badge--dot {
  width: 7px;
  height: 7px;
  padding: 0;
  border-radius: 50%;
}
.sa-badge--default { background: var(--tk-bg-secondary); color: var(--tk-text-tertiary); }
.sa-badge--accent  { background: var(--tk-accent); color: #fff; }
.sa-badge--success { background: rgba(52, 199, 89, 0.1); color: var(--tk-success); }
.sa-badge--warning { background: rgba(255, 149, 0, 0.1); color: var(--tk-warning); }
.sa-badge--danger  { background: rgba(255, 59, 48, 0.08); color: var(--tk-destructive); }
.sa-badge--frozen  { background: #f2f2f7; color: var(--tk-text-tertiary); }
</style>
