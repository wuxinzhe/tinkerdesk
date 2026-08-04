<template>
  <div class="settings-list">
    <div class="settings-list__header">
      <h2 class="settings-list__title">系统设置</h2>
    </div>
    <nav class="settings-list__items">
      <div
        v-for="item in settingItems"
        :key="item.key"
        :class="['settings-row', { selected: isSelected(item.key) }]"
        @click="selectSetting(item)"
      >
        <div class="settings-row__icon" v-html="item.icon"></div>
        <div class="settings-row__body">
          <div class="settings-row__name">{{ item.label }}</div>
          <div class="settings-row__desc">{{ item.desc }}</div>
        </div>
        <svg class="settings-row__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

interface SettingItem {
  key: string
  label: string
  desc: string
  icon: string
}

const settingItems: SettingItem[] = [
  {
    key: 'model',
    label: '模型设置',
    desc: '管理 AI 模型提供商和默认模型',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>'
  },
  {
    key: 'mcp',
    label: 'MCP 工具',
    desc: '管理 MCP 服务器和外部工具',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>'
  },
  {
    key: 'account',
    label: '账户设置',
    desc: '管理账户信息和安全设置',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
  },
  {
    key: 'theme',
    label: '主题设置',
    desc: '自定义界面主题和显示偏好',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
  }
]

const route = useRoute()
const router = useRouter()

const selectedKey = computed(() => route.params.section as string || '')

function selectSetting(item: SettingItem) {
  router.push(`/workspace/settings/${item.key}`)
}

function isSelected(key: string): boolean {
  return selectedKey.value === key
}
</script>

<style scoped>
/* ── Apple 风格设置列表 ── */
.settings-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--sa-bg-primary, #ffffff);
}

/* ── Header ── */
.settings-list__header {
  padding: 28px 20px 12px;
  flex-shrink: 0;
}

.settings-list__title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--sa-text-primary, #1d1d1f);
  letter-spacing: -0.3px;
}

/* ── Items ── */
.settings-list__items {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 12px;
}

/* ── Row ── */
.settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  user-select: none;
  transition: background 0.12s;
}
.settings-row + .settings-row {
  margin-top: 2px;
}
.settings-row:hover {
  background: var(--sa-bg-secondary, #f5f5f7);
}
.settings-row.selected {
  background: var(--sa-bg-secondary, #f5f5f7);
}

/* ── Icon ── */
.settings-row__icon {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: #fff;
}
/* 每个图标对应不同背景色（iOS Settings 风格） */
.settings-row:nth-child(1) .settings-row__icon { background: #007aff; }   /* 模型 — 蓝色 */
.settings-row:nth-child(2) .settings-row__icon { background: #34c759; }   /* MCP — 绿色 */
.settings-row:nth-child(3) .settings-row__icon { background: #ff9500; }   /* 账户 — 橙色 */
.settings-row:nth-child(4) .settings-row__icon { background: #af52de; }   /* 主题 — 紫色 */

/* ── Body ── */
.settings-row__body {
  flex: 1;
  min-width: 0;
}

.settings-row__name {
  font-size: 14px;
  font-weight: 500;
  color: var(--sa-text-primary, #1d1d1f);
  line-height: 1.3;
}

.settings-row__desc {
  font-size: 11px;
  color: var(--sa-text-tertiary, #aeaeb2);
  line-height: 1.3;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Chevron ── */
.settings-row__chevron {
  flex-shrink: 0;
  color: var(--sa-text-tertiary, #aeaeb2);
  opacity: 0.6;
}

@media (max-width: 767px) {
  .settings-list__header {
    padding: 16px 16px 8px;
  }
  .settings-list__title {
    font-size: 18px;
  }
  .settings-list__items {
    padding: 0 8px 8px;
  }
}
</style>
