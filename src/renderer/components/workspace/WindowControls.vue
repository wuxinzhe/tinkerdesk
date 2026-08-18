<script setup lang="ts">
/**
 * WindowControls.vue — 侧边栏顶部工具行：
 * 左 = macOS 风格窗口交通灯（关闭/最小化/最大化）
 * 右 = 专注模式 + 锁屏（靠右对齐）
 */
import { ref, inject, onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/renderer/stores/session-store'

const api = window.api
const maximized = ref(false)
const sessionStore = useSessionStore()
const router = useRouter()

/** 进入开放市场 */
function openMarket(): void {
  void router.push('/workspace/market')
}

/** 侧边栏折叠状态（WorkspaceView provide） */
const sidebarCollapsed = inject<Ref<boolean>>('sidebar-collapsed', ref(false))

const emit = defineEmits<{
  'toggle-sidebar': []
}>()

/** 收起/展开侧边栏 */
function toggleSidebar() {
  emit('toggle-sidebar')
}

/** 锁屏（原 TitleBar 逻辑） */
function handleLock() {
  sessionStore.setLocked(true)
}

/** 专注模式：窗口收窄到 375×812（临时突破 minWidth 768——再点恢复桌面） */
function togglePhoneMode() {
  void window.api.setPhoneMode().then(() => {
    // 路由重置：清空历史栈 + 直接定位对话页 lv2 session-list（/workspace/chat）
    const target = '#/workspace/chat'
    history.replaceState(null, '', location.pathname + location.search + target)
    void router.replace('/workspace/chat')
  })
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

<template>
  <div class="window-controls">
    <div class="window-controls__lights">
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

    <!-- 专注 + 锁屏 + 收起侧边栏（靠右对齐——折叠态隐藏，窄条只留三灯） -->
    <div v-if="!sidebarCollapsed" class="window-controls__utils">
      <!-- 开放市场（最左） -->
      <button class="wc-util" title="开放市场" @click="openMarket">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      </button>
      <button class="wc-util" title="专注模式" @click="togglePhoneMode">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <rect x="9" y="7" width="6" height="10" rx="1" />
        </svg>
      </button>
      <button class="wc-util" title="锁屏 (Ctrl+Shift+L)" @click="handleLock">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="11" width="16" height="9" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          <circle cx="12" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <!-- 收起/展开侧边栏（最右） -->
      <button class="wc-util" :title="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'" @click="toggleSidebar">
        <svg v-if="!sidebarCollapsed" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M14 4v16" />
          <polyline points="9 9 6 12 9 15" />
        </svg>
        <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M10 4v16" />
          <polyline points="15 9 18 12 15 15" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.window-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 4px;
  flex-shrink: 0;
  /* 窗口拖拽区（按住拖动——按钮 no-drag） */
  -webkit-app-region: drag;
}

.window-controls button {
  -webkit-app-region: no-drag;
}

.window-controls__lights {
  display: flex;
  align-items: center;
  gap: 8px;
}

.window-controls__utils {
  display: flex;
  align-items: center;
  gap: 2px;
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

/* 专注/锁屏工具按钮 */
.wc-util {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--tk-text-tertiary);
  cursor: pointer;
  transition: background 160ms cubic-bezier(0.23, 1, 0.32, 1), color 160ms cubic-bezier(0.23, 1, 0.32, 1), transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.wc-util:active {
  transform: scale(0.94);
}

@media (hover: hover) and (pointer: fine) {
  .wc-util:hover {
    background: var(--tk-bg-secondary);
    color: var(--tk-text-primary);
  }
}
</style>
