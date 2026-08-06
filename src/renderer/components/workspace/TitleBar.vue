<template>
  <header class="title-bar" :class="{ maximized }">
    <!-- macOS 风格交通灯按钮（12px 圆、8px 间距、hover 显示图标） -->
    <div class="title-bar__traffic-lights">
      <button class="tl-btn tl-btn--close" title="关闭" @click="handleClose">
        <svg width="8" height="8" viewBox="0 0 8 8" class="tl-icon" fill="none"
          stroke="#4d0000" stroke-width="1" stroke-linecap="round">
          <path d="M2.6 2.6l2.8 2.8M5.4 2.6L2.6 5.4" />
        </svg>
      </button>
      <button class="tl-btn tl-btn--minimize" title="最小化" @click="handleMinimize">
        <svg width="8" height="8" viewBox="0 0 8 8" class="tl-icon" fill="none"
          stroke="#90591d" stroke-width="1" stroke-linecap="round">
          <path d="M2.4 4h3.2" />
        </svg>
      </button>
      <button class="tl-btn tl-btn--maximize" :title="maximized ? '还原' : '最大化'" @click="handleMaximize">
        <!-- expand：两个对角箭头（指向左上/右下）——macOS 全屏标准图标 -->
        <svg v-if="!maximized" width="8" height="8" viewBox="0 0 8 8" class="tl-icon" fill="none"
          stroke="#0a5a00" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4.3 4.3L2.2 2.2M2.2 2.2l1.1-.15M2.2 2.2l.15 1.1" />
          <path d="M3.7 3.7l2.1 2.1M5.8 5.8l-1.1.15M5.8 5.8l-.15-1.1" />
        </svg>
        <!-- restore：两个对角箭头（指向右上/左下）——还原标准图标 -->
        <svg v-else width="8" height="8" viewBox="0 0 8 8" class="tl-icon" fill="none"
          stroke="#0a5a00" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4.3 3.7L5.8 2.2M5.8 2.2l-.15-1.1M5.8 2.2l-1.1-.15" />
          <path d="M3.7 4.3L2.2 5.8M2.2 5.8l.15 1.1M2.2 5.8l1.1.15" />
        </svg>
      </button>
    </div>

    <!-- 可拖拽区域 -->
    <div class="title-bar__drag"></div>

    <!-- 锁屏按钮（右侧） -->
    <button class="title-bar__lock" title="锁屏 (Ctrl+Shift+L)" @click="handleLock">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="11" width="16" height="9" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        <circle cx="12" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    </button>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useSessionStore } from '@/renderer/stores/session-store'
import '@/renderer/api/types'

const maximized = ref(false)

const api = window.api
const sessionStore = useSessionStore()

function handleLock() {
  sessionStore.setLocked(true)
}

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

<style scoped>
.title-bar {
  display: flex;
  align-items: center;
  height: 32px;
  flex-shrink: 0;
  background: var(--sa-bg-primary, #ffffff);
  user-select: none;
}

/* ── 交通灯按钮容器 ── */
.title-bar__traffic-lights {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  flex-shrink: 0;
}

/* ── 单个交通灯按钮 ── */
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

.title-bar:hover .tl-btn .tl-icon {
  opacity: 1;
}

.tl-btn--close {
  background: #fe5f57;
}
.tl-btn--close:hover {
  background: #e0443e;
}

.tl-btn--minimize {
  background: #f6be50;
}
.tl-btn--minimize:hover {
  background: #e1a73e;
}

.tl-btn--maximize {
  background: #28c840;
}
.tl-btn--maximize:hover {
  background: #1eaa32;
}

/* ── 可拖拽区域 ── */
.title-bar__drag {
  flex: 1;
  -webkit-app-region: drag;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  min-width: 0;
}

/* ── 锁屏按钮（右侧） ── */
.title-bar__lock {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-right: 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--sa-text-tertiary, #aeaeb2);
  cursor: pointer;
  transition: background-color 0.2s ease-in-out, color 0.2s ease-in-out;
}

.title-bar__lock:hover {
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-text-primary, #1d1d1f);
}

.title-bar__lock:active {
  background: var(--sa-bg-tertiary, #fafafa);
}

</style>
