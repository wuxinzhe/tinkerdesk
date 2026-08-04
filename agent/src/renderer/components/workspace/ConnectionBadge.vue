<template>
  <div v-if="connecting" class="workspace__connecting">
    重新连接中...
  </div>
</template>

<script setup lang="ts">
defineProps<{ connecting: boolean }>()
</script>

<style scoped>
.workspace__connecting {
  position: fixed;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 16px;
  background: var(--sa-accent, #007aff);
  color: #ffffff;
  font-size: 12px;
  border-radius: 20px;
  z-index: 999;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}
</style>
