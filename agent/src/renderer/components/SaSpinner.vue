<template>
  <span
    :class="['sa-spinner', `sa-spinner--${size}`]"
    :style="light ? { borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#ffffff' } : undefined"
  />
</template>

<script setup lang="ts">
export type SaSpinnerSize = 'small' | 'medium' | 'large'

interface SaSpinnerProps {
  size?: SaSpinnerSize
  light?: boolean
}

withDefaults(defineProps<SaSpinnerProps>(), {
  size: 'small',
  light: false,
})
</script>

<style scoped>
.sa-spinner {
  display: inline-block;
  border-radius: 50%;
  animation: sa-spin 0.6s linear infinite;
  border-style: solid;
  border-color: var(--sa-border, #e8e8ed);
  border-top-color: var(--sa-accent, #007aff);
}

.sa-spinner--small {
  width: 14px;
  height: 14px;
  border-width: 2px;
}

.sa-spinner--medium {
  width: 16px;
  height: 16px;
  border-width: 2px;
}

.sa-spinner--large {
  width: 24px;
  height: 24px;
  border-width: 3px;
}
</style>
