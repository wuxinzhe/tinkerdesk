<script setup lang="ts">
/**
 * WindowControls.vue — macOS 风格窗口交通灯（关闭/最小化/最大化）
 * 侧边栏顶部常驻——替代原 TitleBar 的窗口控制。
 */
import { ref, onMounted, onUnmounted } from 'vue'

const api = window.api
const maximized = ref(false)

async function handleMinimize() {
  await api?.windowMinimize()
}

async function handleMaximize() {
  await api?.windowMaximize()
  maximized.value = await api?.isMaximized() ?? false
}

async function handleClose() {
  await api?.windowClose()
}

function onResize() {
  api?.isMaximized().then((v: boolean) => { maximized.value = v })
}

onMounted(() => {
  api?.isMaximized().then((v: boolean) => { maximized.value = v })
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="window-controls">
    <button class="tl-btn tl-btn--close" title="关闭" @click="handleClose">
      <svg width="8" height="8" viewBox="0 0 8 8" class="tl-icon" fill="none" stroke="#4d0000" stroke-width="1" stroke-linecap="round">
        <path d="M2.6 2.6l2.8 2.8M5.4 2.6L2.6 5.4" />
      </svg>
    </button>
    <button class="tl-btn tl-btn--minimize" title="最小化" @click="handleMinimize">
      <svg width="8" height="8" viewBox="0 0 8 8" class="tl-icon" fill="none" stroke="#90591d" stroke-width="1" stroke-linecap="round">
        <path d="M2.4 4h3.2" />
      </svg>
    </button>
    <button class="tl-btn tl-btn--maximize" :title="maximized ? '还原' : '最大化'" @click="handleMaximize">
      <svg v-if="!maximized" width="8" height="8" viewBox="0 0 8 8" class="tl-icon" fill="none" stroke="#0a5a00" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4.3 4.3L2.2 2.2M2.2 2.2l1.1-.15M2.2 2.2l.15 1.1" />
        <path d="M3.7 3.7l2.1 2.1M5.8 5.8l-1.1.15M5.8 5.8l-.15-1.1" />
      </svg>
      <svg v-else width="8" height="8" viewBox="0 0 8 8" class="tl-icon" fill="none" stroke="#0a5a00" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4.3 3.7L5.8 2.2M5.8 2.2l-.15-1.1M5.8 2.2l-1.1-.15" />
        <path d="M3.7 4.3L2.2 5.8M2.2 5.8l.15 1.1M2.2 5.8l1.1.15" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.window-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 4px;
  flex-shrink: 0;
}

.tl-btn {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.tl-btn .tl-icon {
  opacity: 0;
  transition: opacity 0.1s;
}

.tl-btn:hover .tl-icon {
  opacity: 1;
}

.tl-btn--close {
  background: #ff5f57;
}

.tl-btn--minimize {
  background: #febc2e;
}

.tl-btn--maximize {
  background: #28c840;
}
</style>
