<template>
  <div :class="['nav-wrapper', { collapsed }]">
    <nav class="nav-sidebar">
      <div class="nav-sidebar__items">
        <button
          v-for="item in navItems"
          :key="item.id"
          :class="['nav-sidebar__item', { active: item.id === active }]"
          :title="item.label"
          @click="$emit('select', item.id)"
        >
          <span class="nav-sidebar__icon" v-html="item.icon"></span>
          <span class="nav-sidebar__label">{{ item.label }}</span>
        </button>
      </div>

      <!-- 退出登录（固定在底部） -->
      <div class="nav-sidebar__bottom">
        <button
          class="nav-sidebar__item"
          title="退出登录"
          @click="handleLogout"
        >
          <span class="nav-sidebar__icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </span>
          <span class="nav-sidebar__label">退出</span>
        </button>
      </div>
    </nav>

    <!-- 折叠切换按钮（浮动在右侧边缘） -->
    <button
      class="nav-toggle"
      :class="{ collapsed }"
      :title="collapsed ? '展开导航栏' : '折叠导航栏'"
      @click="$emit('update:collapsed', !collapsed)"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline v-if="!collapsed" points="15 18 9 12 15 6" />
        <polyline v-else points="9 18 15 12 9 6" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { logoutAndClear } from '@/api/auth-api'
import { useSessionStore } from '@/stores/session-store'
import { useChatStore } from '@/renderer/stores/chat-store'

defineProps<{
  active: string
  collapsed?: boolean
}>()

defineEmits<{
  select: [id: string]
  'update:collapsed': [value: boolean]
}>()

const router = useRouter()
const sessionStore = useSessionStore()
const chatStore = useChatStore()

function handleLogout() {
  logoutAndClear()
  sessionStore.$reset()
  chatStore.$reset()
  router.replace({ name: 'splash' })
}

const navItems = [
  {
    id: 'agent-chat',
    label: '对话',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>`
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>`
  },
  {
    id: 'workshop',
    label: '工坊',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87"/>
      <path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>`
  },
  {
    id: 'settings',
    label: '系统设置',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>`
  }
]
</script>

<style scoped>
/* ── Wrapper: positioned anchor for toggle ── */

.nav-wrapper {
  position: relative;
  flex-shrink: 0;
  width: 200px;
  transition: width 0.2s ease;
  display: flex;
  background: var(--sa-bg-primary, #ffffff);
  border-right: 1px solid var(--sa-border, #d2d2d7);
}

.nav-wrapper.collapsed {
  width: 65px;
}

/* ── Nav sidebar ── */

.nav-sidebar {
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 12px 8px;
  overflow: hidden;
  min-width: 0;
}

.nav-sidebar__items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
}

.nav-sidebar__bottom {
  margin-top: auto;
  width: 100%;
}

.nav-sidebar__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--sa-text-secondary, #86868b);
  cursor: pointer;
  border-radius: 7px;
  transition: background 0.12s, color 0.12s;
  text-align: left;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.nav-sidebar__item:hover {
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-text-primary, #1d1d1f);
}

.nav-sidebar__item.active {
  background: var(--sa-accent, #007aff);
  color: #ffffff;
}

.nav-sidebar__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

/* ── Label hidden when collapsed ── */

.collapsed .nav-sidebar__label {
  opacity: 0;
  width: 0;
  overflow: hidden;
  transition: opacity 0.12s, width 0.2s;
}

/* ── Collapse toggle button ── */

.nav-toggle {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%) translateX(50%);
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 40px;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 6px 0 0 6px;
  border-right: none;
  background: var(--sa-bg-primary, #ffffff);
  color: var(--sa-text-tertiary, #aeaeb2);
  cursor: pointer;
  padding: 0;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}

.nav-toggle:hover {
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-accent, #007aff);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.nav-toggle.collapsed {
  border-radius: 0 6px 6px 0;
  border-left: none;
  border-right: 1px solid var(--sa-border, #d2d2d7);
}
</style>
