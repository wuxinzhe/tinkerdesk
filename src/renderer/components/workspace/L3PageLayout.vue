<template>
  <div class="l3-page-layout" :data-mounted="mounted">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

/** 进入动画标记（挂载后下一帧置 true——触发淡入；emil：设置页低频访问可有一点动画） */
const mounted = ref(false)

onMounted(() => {
  requestAnimationFrame(() => {
    mounted.value = true
  })
})
</script>

<style scoped>
.l3-page-layout {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px;
  container-type: inline-size;
  container-name: l3-content;
  /* 进入动画：淡入 + 微上移（200ms 强 ease-out——只动 transform/opacity） */
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.l3-page-layout[data-mounted='true'] {
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .l3-page-layout {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
