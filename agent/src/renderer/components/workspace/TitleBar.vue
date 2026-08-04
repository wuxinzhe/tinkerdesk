<template>
  <header class="title-bar" :class="{ maximized }">
    <!-- macOS 风格交通灯按钮 -->
    <div class="title-bar__traffic-lights">
      <button class="tl-btn tl-btn--close" title="关闭" @click="handleClose">
        <svg width="8" height="8" viewBox="0 0 8 8" class="tl-icon">
          <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="rgba(0,0,0,0.4)" stroke-width="1" fill="none" />
        </svg>
      </button>
      <button class="tl-btn tl-btn--minimize" title="最小化" @click="handleMinimize">
        <svg width="8" height="8" viewBox="0 0 8 8" class="tl-icon">
          <path d="M2 4h4" stroke="rgba(0,0,0,0.4)" stroke-width="1" fill="none" />
        </svg>
      </button>
      <button class="tl-btn tl-btn--maximize" :title="maximized ? '还原' : '最大化'" @click="handleMaximize">
        <svg v-if="!maximized" width="8" height="8" viewBox="0 0 8 8" class="tl-icon">
          <rect x="1.5" y="1.5" width="5" height="5" stroke="rgba(0,0,0,0.4)" stroke-width="1" fill="none" />
        </svg>
        <svg v-else width="8" height="8" viewBox="0 0 8 8" class="tl-icon">
          <rect x="2" y="0.5" width="5" height="5" stroke="rgba(0,0,0,0.4)" stroke-width="1" fill="none" />
          <rect x="0.5" y="2" width="5" height="5" stroke="rgba(0,0,0,0.4)" stroke-width="1" fill="#fff" />
        </svg>
      </button>
    </div>

    <!-- 可拖拽区域 -->
    <div class="title-bar__drag"></div>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const maximized = ref(false)

const api = (window as any).api

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
  gap: 7px;
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
  background: #febc2e;
}
.tl-btn--minimize:hover {
  background: #dd9e1a;
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

</style>
