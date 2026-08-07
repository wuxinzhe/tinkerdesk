<template>
  <div class="agent-list">
    <div class="agent-list__header">
      <span class="agent-list__title">Agent 列表</span>
      <button class="agent-list__create-btn" title="创建 Agent" @click="onCreate">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>

    <!-- 骨架屏加载 -->
    <div v-if="loading" class="agent-list__skeleton">
      <div v-for="i in 6" :key="i" class="agent-list__skeleton-item">
        <SaSkeleton variant="circle" :circle-size="'35px'" />
        <div class="agent-list__skeleton-body">
          <SaSkeleton variant="text" :text-lines="1" height="14px" last-line-width="55%" />
          <SaSkeleton variant="text" :text-lines="1" height="11px" last-line-width="35%" />
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="agents.length === 0" class="agent-list__empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
      <p>还没有 Agent</p>
    </div>

    <!-- 列表 -->
    <div
      v-else
      class="agent-list__items"
    >
      <div
        v-for="(a, index) in agents"
        :key="a.profile"
        :style="{ '--i': index }"
        :class="['agent-card-item', { selected: selectedProfile === a.profile }]"
        @click="selectAgent(a)"
      >
        <div class="agent-card-item__row1">
          <div class="agent-card-item__avatar">
            <img v-if="a.avatar" :src="a.avatar" alt="" class="agent-card-item__avatar-img" />
            <img v-else src="/default_avatar.png" alt="" class="agent-card-item__avatar-img" />
          </div>
          <div class="agent-card-item__info">
            <div class="agent-card-item__name-row">
              <span class="agent-card-item__name-text">{{ a.displayName }}</span>
              <span class="agent-card-item__profile-text">（{{ a.profile }}）</span>
              <span class="agent-card-item__name-spacer" />
              <span v-if="a.isDefault" class="agent-card-item__tag tag-default">默认</span>
              <span v-else-if="!a.isActive" class="agent-card-item__tag tag-frozen">冻结</span>
            </div>
            <div class="agent-card-item__actions">
          <button class="agent-card-item__action" title="对话" @click.stop="startConversation(a)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </button>
          <button class="agent-card-item__action" title="技能" @click.stop="manageSkills(a)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </button>
          <button class="agent-card-item__action" title="工具" @click.stop="manageTools(a)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
            </svg>
          </button>
          <button class="agent-card-item__action" title="模型" @click.stop="manageModels(a)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <rect x="8" y="8" width="8" height="8" rx="1" />
            </svg>
          </button>
          <button class="agent-card-item__action" title="提示词" @click.stop="managePromptModules(a)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="13" x2="15" y2="13" />
              <line x1="9" y1="17" x2="13" y2="17" />
            </svg>
          </button>
          <button class="agent-card-item__action" title="设置" @click.stop="manageSettings(a)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-2.51.26A1.65 1.65 0 0113 21a2 2 0 01-4 0 1.65 1.65 0 00-1.43-1.01 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
          <button class="agent-card-item__action" title="编辑" @click.stop="openEdit(a)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        </div>
        </div>
      </div>
    </div>
  </div>
</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { AgentInfo } from '@/renderer/api/types'
import { useSessionStore } from '@/renderer/stores/session-store'
import { useChatStore } from '@/renderer/stores/chat-store'
import { agentsApi } from '@/renderer/api/agents-api'
import { SaSkeleton } from '@/renderer/components'

const router = useRouter()
const route = useRoute()
const sessionStore = useSessionStore()
const chatStore = useChatStore()

const agents = ref<AgentInfo[]>([])
const loading = ref(true)

/** 当前选中的 profile（从路由参数同步） */
const selectedProfile = ref<string | null>(null)

async function loadAgents(skipLoading = false) {
  if (!skipLoading) loading.value = true
  try {
    agents.value = await agentsApi.list()
  } catch {
    agents.value = []
  } finally {
    loading.value = false
  }
}

function selectAgent(a: AgentInfo) {
  selectedProfile.value = a.profile
}

function startConversation(a: AgentInfo) {
  sessionStore.setSessionId(null)
  sessionStore.setProfile(a.profile)
  chatStore.resetLocalState?.()
  router.replace({ path: '/workspace/chat' })
}

function manageSkills(a: AgentInfo) {
  selectedProfile.value = a.profile
  router.push(`/workspace/agents/${a.profile}/skills`)
}

function manageTools(a: AgentInfo) {
  selectedProfile.value = a.profile
  router.push(`/workspace/agents/${a.profile}/tools`)
}

function manageModels(a: AgentInfo) {
  selectedProfile.value = a.profile
  router.push(`/workspace/agents/${a.profile}/models`)
}

function managePromptModules(a: AgentInfo) {
  selectedProfile.value = a.profile
  router.push(`/workspace/agents/${a.profile}/prompt-modules`)
}

function manageSettings(a: AgentInfo) {
  selectedProfile.value = a.profile
  router.push(`/workspace/agents/${a.profile}/settings`)
}

function openEdit(a: AgentInfo) {
  selectedProfile.value = a.profile
  router.push(`/workspace/agents/${a.profile}/edit`)
}

function onCreate() {
  router.push('/workspace/agents/create')
}

/** 同步选中状态：当路由中有 profile 参数时高亮对应卡片 */
function syncSelectedProfile() {
  const profile = route.params.profile as string | undefined
  if (profile) {
    selectedProfile.value = profile
  } else {
    selectedProfile.value = null
  }
}

onMounted(async () => {
  await loadAgents()
  syncSelectedProfile()
})
</script>

<style scoped>
/* ── 布局 ── */
.agent-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.agent-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  flex-shrink: 0;
}

.agent-list__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sa-text-secondary, #86868b);
  letter-spacing: 0.5px;
}

.agent-list__create-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--sa-text-secondary, #86868b);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.agent-list__create-btn:hover {
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-accent, #007aff);
}

.agent-list__loading,
.agent-list__empty,
.agent-list__skeleton {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--sa-text-tertiary, #aeaeb2);
  font-size: 13px;
  padding: 20px;
}

.agent-list__skeleton {
  justify-content: flex-start;
  padding: 10px 8px;
  gap: 0;
}

.agent-list__skeleton-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  width: 100%;
}

.agent-list__skeleton-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.agent-list__items {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

/* ── 入场动画 ── */
@keyframes agent-item-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

/* ── Agent 卡片（两行式） ── */
.agent-card-item {
  animation: agent-item-enter 0.35s ease both;
  animation-delay: calc(var(--i) * 28ms);
  padding: 8px 14px 6px;
  cursor: pointer;
  transition: background 0.12s;
  user-select: none;
}
.agent-card-item:hover {
  background: var(--sa-bg-secondary, #f5f5f7);
}
.agent-card-item.selected {
  background: rgba(0, 122, 255, 0.06);
}

/* Row 1: avatar + info */
.agent-card-item__row1 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-card-item__avatar {
  flex-shrink: 0;
  width: 35px;
  height: 35px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--sa-accent, #007aff);
  color: #fff;
  overflow: hidden;
  margin-bottom: 5px;
}
.agent-card-item__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.agent-card-item__info {
  flex: 1;
  min-width: 0;
}

/* name 行：名字（profile）… 默认tag靠右 */
.agent-card-item__name-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 2px;
}
.agent-card-item__name-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--sa-text-primary, #1d1d1f);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 130px;
}

.agent-card-item__profile-text {
  font-size: 11px;
  color: var(--sa-text-tertiary, #aeaeb2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 90px;
}

.agent-card-item__name-spacer {
  flex: 1;
}

.agent-card-item__tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
  font-weight: 500;
}
.tag-default {
  background: #007aff;
  color: #fff;
}
.tag-frozen {
  background: #f2f2f7;
  color: #86868b;
}


/* ── Row 2: 操作按钮行 ── */
.agent-card-item__actions {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
  transition: opacity 0.12s;
}

/* Hover-capable（桌面鼠标）：悬停时显示按钮 */
@media (hover: hover) {
  .agent-card-item__actions {
    opacity: 0;
  }
  .agent-card-item:hover .agent-card-item__actions {
    opacity: 1;
  }
}

/* 非 hover 设备（平板/手机触摸）：始终显示 */
@media (hover: none) {
  .agent-card-item__actions {
    opacity: 1;
  }
}

/* 窄窗口（平板/手机布局——Electron 窗口 resize 后 hover 检测仍是 hover: hover，
   需按窗口宽度覆盖）：按钮始终显示，不依赖悬停 */
@media (max-width: 1023px) {
  .agent-card-item__actions {
    opacity: 1;
  }
}

.agent-card-item__action {
  all: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: var(--sa-text-tertiary, #aeaeb2);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.agent-card-item__action:hover {
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-accent, #007aff);
}
</style>
