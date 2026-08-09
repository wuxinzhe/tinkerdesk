<template>
  <div class="sa-loading">
    <SaSpinner :size="size" :light="light" />
    <p v-if="text" class="sa-loading__text">
      {{ text }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { SaSpinner } from '@/renderer/components'

export type SaLoadingSize = 'small' | 'medium' | 'large'

interface SaLoadingProps {
  text?: string
  size?: SaLoadingSize
  light?: boolean
}

withDefaults(defineProps<SaLoadingProps>(), {
  size: 'small',
  light: false,
})
</script>

<style scoped>
.sa-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--tk-text-tertiary);
}
.sa-loading__text {
  margin: 0;
  font-size: 13px;
}
</style>
