<template>
  <Teleport to="body">
    <div v-if="open" class="workspace__drawer-overlay" @click="$emit('close')" />
    <aside :class="['workspace__drawer', { open }]">
      <div class="workspace__drawer-header">
        <div class="workspace__drawer-logo">SA</div>
      </div>
      <nav class="workspace__drawer-nav">
        <button
          v-for="item in items"
          :key="item.id"
          :class="['workspace__drawer-item', { active: activeTab === item.id }]"
          @click="onSelect(item.id)"
        >
          <span class="workspace__drawer-icon" v-html="item.icon"></span>
          <span>{{ item.label }}</span>
        </button>
      </nav>
    </aside>
  </Teleport>
</template>

<script setup lang="ts">
const props = defineProps<{
  open: boolean
  activeTab: string
}>()

const emit = defineEmits<{
  close: []
  select: [id: string]
}>()

const items = [
  { id: 'agent-chat', label: '对话', icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>` },
  { id: 'agents', label: 'Agents', icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>` },
  { id: 'workshop', label: '工坊', icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>` },
  { id: 'settings', label: '系统设置', icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>` },
]

function onSelect(id: string) {
  emit('select', id)
  emit('close')
}
</script>

<style scoped>
.workspace__drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 200;
}

.workspace__drawer {
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 280px;
  background: var(--sa-bg-primary, #ffffff);
  z-index: 300;
  transform: translateX(-100%);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.08);
}

.workspace__drawer.open {
  transform: translateX(0);
}

.workspace__drawer-header {
  padding: 24px 20px 16px;
}

.workspace__drawer-logo {
  width: 32px;
  height: 32px;
  background: var(--sa-accent, #007aff);
  color: #fff;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

.workspace__drawer-nav {
  flex: 1;
  padding: 0 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.workspace__drawer-footer {
  padding: 12px;
  border-top: 1px solid var(--sa-border, #d2d2d7);
}

.workspace__drawer-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  color: var(--sa-text-primary, #1d1d1f);
  font-family: inherit;
  transition: background 0.12s;
}

.workspace__drawer-item:hover {
  background: var(--sa-bg-secondary, #f5f5f7);
}

.workspace__drawer-item.active {
  color: var(--sa-accent, #007aff);
  background: rgba(0, 122, 255, 0.06);
}

.workspace__drawer-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}
</style>
