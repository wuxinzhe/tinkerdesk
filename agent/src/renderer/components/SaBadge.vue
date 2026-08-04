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
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  line-height: 1.5;
  white-space: nowrap;
  flex-shrink: 0;
}
.sa-badge--dot {
  width: 7px;
  height: 7px;
  padding: 0;
  border-radius: 50%;
}
.sa-badge--default { background: var(--sa-bg-secondary, #f2f2f7); color: var(--sa-text-tertiary, #aeaeb2); }
.sa-badge--accent  { background: var(--sa-accent, #007aff); color: #fff; }
.sa-badge--success { background: rgba(52, 199, 89, 0.1); color: #34c759; }
.sa-badge--warning { background: rgba(255, 149, 0, 0.1); color: #ff9500; }
.sa-badge--danger  { background: rgba(255, 59, 48, 0.08); color: #ff3b30; }
.sa-badge--frozen  { background: #f2f2f7; color: var(--sa-text-tertiary, #aeaeb2); }
</style>
