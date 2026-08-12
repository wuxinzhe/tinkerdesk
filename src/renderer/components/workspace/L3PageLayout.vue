<template>
  <div class="l3-page-layout" :data-mounted="mounted">
    <!-- 内容包装：宽度统一由布局组件管理（680 靠左）——
         滚动容器（l3-page-layout）全宽——滚动条在窗口最右 -->
    <div class="l3-page-layout__body">
      <slot />
    </div>
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

/* 内容窄列（680 靠左）——滚动条跟随全宽滚动容器（窗口最右） */
.l3-page-layout__body {
  max-width: 680px;
  width: 100%;
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

/* 平板模式（768–1023px）：padding 介于桌面与手机之间 */
@media (min-width: 768px) and (max-width: 1023px) {
  .l3-page-layout {
    padding: 16px 20px;
  }
}

/* 手机模式：统一 12px（页面自身 padding 已归零——无叠加） */
@media (max-width: 767px) {
  .l3-page-layout {
    padding: 12px;
  }
}
</style>
