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

      <!-- 折叠按钮（底部——与功能区按钮同款样式） -->
      <button
        class="nav-sidebar__item nav-sidebar__collapse"
        :title="collapsed ? '展开导航栏' : '折叠导航栏'"
        @click="$emit('update:collapsed', !collapsed)"
      >
        <span class="nav-sidebar__icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline v-if="!collapsed" points="15 18 9 12 15 6" />
            <polyline v-else points="9 18 15 12 9 6" />
          </svg>
        </span>
        <span class="nav-sidebar__label">{{ collapsed ? '展开' : '折叠' }}</span>
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  active: string
  collapsed?: boolean
}>()

defineEmits<{
  select: [id: string]
  'update:collapsed': [value: boolean]
}>()

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
      <rect x="4" y="8" width="16" height="12" rx="3"/>
      <circle cx="9" cy="14" r="1.2"/>
      <circle cx="15" cy="14" r="1.2"/>
      <path d="M9 17.5h6"/>
      <path d="M12 8V4"/>
      <circle cx="12" cy="3" r="1.2"/>
    </svg>`
  },
  {
    id: 'workshop',
    label: '工坊',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="8" height="8" rx="2"/>
      <rect x="13" y="3" width="8" height="8" rx="2"/>
      <rect x="3" y="13" width="8" height="8" rx="2"/>
      <rect x="13" y="13" width="8" height="8" rx="2"/>
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
  flex: 1; /* 撑满——折叠按钮固定在底部 */
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

/* ── 折叠按钮（底部——复用 nav-sidebar__item 样式） ── */

.nav-sidebar__collapse {
  margin-top: 8px;
}
</style>
