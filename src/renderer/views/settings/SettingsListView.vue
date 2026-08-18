<template>
  <div class="settings-list" :data-mounted="mounted">
    <div class="settings-list__header">
      <h2 class="settings-list__title">
        系统设置
      </h2>
      <p class="settings-list__subtitle">
        应用偏好、模型与扩展
      </p>
    </div>
    <nav class="settings-list__items">
      <div class="settings-list__card">
        <div
          v-for="(item, i) in settingItems"
          :key="item.key"
          :class="['settings-row', { selected: isSelected(item.key) }]"
          :style="{ transitionDelay: `${i * 35}ms` }"
          @click="selectSetting(item)"
        >
          <div class="settings-row__icon" v-html="item.icon"></div>
          <div class="settings-row__body">
            <div class="settings-row__name">
              {{ item.label }}
            </div>
            <div class="settings-row__desc">
              {{ item.desc }}
            </div>
          </div>
          <svg class="settings-row__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

interface SettingItem {
  key: string
  label: string
  desc: string
  icon: string
}

/** 进入动画标记（stagger 触发） */
const mounted = ref(false)

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
    key: 'providers',
    label: '扩展设置',
    desc: '管理客户端扩展和扩展能力',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>'
  },

  {
    key: 'general',
    label: '通用设置',
    desc: '快捷键等全局偏好配置',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="7" y1="9" x2="7" y2="9"/><line x1="12" y1="9" x2="12" y2="9"/><line x1="17" y1="9" x2="17" y2="9"/><line x1="7" y1="15" x2="17" y2="15"/></svg>'
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

onMounted(() => {
  requestAnimationFrame(() => {
    mounted.value = true
  })
})
</script>

<style scoped>
/* ── emil 风格设置导航：分组卡片 + 行间分隔 + 图标色块 ── */
.settings-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: transparent;
}

/* ── Header ── */
.settings-list__header {
  padding: 28px 24px 16px;
  flex-shrink: 0;
}

.settings-list__title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--tk-text-primary);
  letter-spacing: -0.3px;
}

.settings-list__subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--tk-text-tertiary);
}

/* ── Items ── */
.settings-list__items {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 16px;
}

/* 分组卡片（与 L3 页卡片统一：大圆角 + 分层阴影） */
.settings-list__card {
  background: var(--tk-bg-primary);
  border: 1px solid var(--tk-border-card);
  border-radius: var(--tk-radius-xl);
  box-shadow: var(--tk-shadow-card);
  overflow: hidden;
  padding: 4px 0;
}

/* ── Row ── */
.settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  cursor: pointer;
  user-select: none;
  /* emil：指定属性过渡 + 强 ease-out；行间分隔线 */
  transition: background-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 240ms cubic-bezier(0.23, 1, 0.32, 1);
  /* 进入 stagger（transitionDelay 由模板按 index 注入） */
  opacity: 0;
  transform: translateY(4px);
}
.settings-row:not(:last-child) {
  border-bottom: 1px solid var(--tk-border-light);
}
.settings-list[data-mounted='true'] .settings-row {
  opacity: 1;
  transform: translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  .settings-row {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
.settings-row:active {
  transform: scale(0.99);
}
@media (hover: hover) and (pointer: fine) {
  .settings-row:hover {
    background: var(--tk-bg-secondary);
  }
}
.settings-row.selected {
  background: var(--tk-bg-selected);
}

/* ── Icon（iOS 彩色色块） ── */
.settings-row__icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  color: #fff;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.1);
}
/* 每个图标对应不同背景色（iOS Settings 风格）——顺序与 items 数组一致 */
.settings-row:nth-child(1) .settings-row__icon { background: var(--tk-accent); }   /* 模型 — 蓝色 */
.settings-row:nth-child(2) .settings-row__icon { background: var(--tk-success); }   /* MCP — 绿色 */
.settings-row:nth-child(3) .settings-row__icon { background: var(--tk-warning); }   /* 扩展 — 橙色 */
.settings-row:nth-child(4) .settings-row__icon { background: #af52de; }   /* 通用 — 灰色 */
.settings-row:nth-child(4) .settings-row__icon { background: #8e8e93; }   /* 通用 — 灰色 */

/* ── Body ── */
.settings-row__body {
  flex: 1;
  min-width: 0;
}

.settings-row__name {
  font-size: 14px;
  font-weight: 500;
  color: var(--tk-text-primary);
  line-height: 1.3;
}

.settings-row__desc {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  line-height: 1.3;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Chevron ── */
.settings-row__chevron {
  flex-shrink: 0;
  color: var(--tk-text-tertiary);
  opacity: 0.6;
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1), opacity 180ms cubic-bezier(0.23, 1, 0.32, 1);
}
.settings-row:hover .settings-row__chevron {
  opacity: 1;
  transform: translateX(2px);
}

@media (max-width: 767px) {
  .settings-list__header {
    padding: 16px 16px 10px;
  }
  .settings-list__title {
    font-size: 18px;
  }
  .settings-list__items {
    padding: 0 12px 12px;
  }
}
</style>
