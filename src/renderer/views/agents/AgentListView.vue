<template>
  <div class="agent-list" :data-mounted="mounted">
    <div class="agent-list__header">
      <div class="agent-list__header-text">
        <h2 class="agent-list__title">
          Agent 管理
        </h2>
        <p class="agent-list__subtitle">
          {{ agents.length }} 个 Agent
        </p>
      </div>
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
      <div class="agent-list__empty-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      </div>
      <p class="agent-list__empty-text">
        还没有 Agent
      </p>
      <p class="agent-list__empty-hint">
        点击右上角 + 创建第一个 Agent
      </p>
    </div>

    <!-- 列表 -->
    <div
      v-else
      class="agent-list__items"
      @scroll.passive="onScroll"
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
            <!-- 描述（名字下方——超出单行省略——纯 CSS，不改文本） -->
            <div v-if="a.description" class="agent-card-item__desc">{{ a.description }}</div>
            <div class="agent-card-item__footer">
              <!-- 操作按钮已移除（2026-08：布局重构——功能入口收敛到 AgentCard/设置页） -->
            </div>
          </div>
        </div>
      </div>

      <!-- 加载更多（向下滚动到底触发） -->
      <div v-if="loadingMore" class="agent-list__more">
        <SaSpinner size="small" />
        <span>加载中…</span>
      </div>
      <div v-else-if="!hasMore && agents.length > 0" class="agent-list__bottom">
        <span class="agent-list__bottom-text">凡事都有底线</span>
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
import { SaSkeleton, SaSpinner } from '@/renderer/components'

const router = useRouter()
const route = useRoute()
const sessionStore = useSessionStore()
const chatStore = useChatStore()

const agents = ref<AgentInfo[]>([])
const loading = ref(true)
/** 进入动画标记（stagger 触发） */
const mounted = ref(false)

/** 当前选中的 profile（从路由参数同步） */
const selectedProfile = ref<string | null>(null)

async function loadAgents(skipLoading = false) {
  if (!skipLoading) loading.value = true
  offset.value = 0
  hasMore.value = true
  try {
    agents.value = await agentsApi.list()
    offset.value = agents.value.length
    hasMore.value = agents.value.length === PAGE_SIZE
  } catch {
    agents.value = []
  } finally {
    loading.value = false
  }
}

/* ── 分页加载（每页 20——向下滚动到底触发加载更多） ── */
const PAGE_SIZE = 20
const offset = ref(0)
const hasMore = ref(true)
const loadingMore = ref(false)

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    const list = await agentsApi.list(undefined, PAGE_SIZE, offset.value)
    agents.value.push(...list)
    offset.value += list.length
    hasMore.value = list.length === PAGE_SIZE
  } catch { /* silent */ } finally {
    loadingMore.value = false
  }
}

/** 向下滚动到底触发加载更多 */
function onScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
    void loadMore()
  }
}

/** 点击 Agent 卡片 → 直接切换为该 Agent（工作区进其对话页） */
function selectAgent(a: AgentInfo) {
  selectedProfile.value = a.profile
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

/** 记忆管理页（MemoryManageView——CRUD + 拖拽排序） */
function manageMemory(a: AgentInfo) {
  router.push(`/workspace/agents/${a.profile}/memory`)
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
  requestAnimationFrame(() => {
    mounted.value = true
  })
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
  padding: 28px 24px 14px;
  flex-shrink: 0;
}

.agent-list__title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--tk-text-primary);
  letter-spacing: -0.3px;
}

.agent-list__subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--tk-text-tertiary);
}

.agent-list__create-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 9px;
  background: var(--tk-bg-primary);
  border: 1px solid var(--tk-border-card);
  box-shadow: var(--tk-shadow-card);
  color: var(--tk-text-secondary);
  cursor: pointer;
  transition: background-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.agent-list__create-btn:active {
  transform: scale(0.97);
}
@media (hover: hover) and (pointer: fine) {
  .agent-list__create-btn:hover {
    background: var(--tk-bg-secondary);
    color: var(--tk-accent);
  }
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
  color: var(--tk-text-tertiary);
  font-size: 13px;
  padding: 20px;
}

/* 空态（与 SaEmpty 一致：图标柔和圆角容器） */
.agent-list__empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-tertiary);
  margin-bottom: 6px;
}
.agent-list__empty-text {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--tk-text-primary);
}
.agent-list__empty-hint {
  margin: 0;
  font-size: 12px;
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
  padding: 4px 20px 16px;
}

/* 加载更多 / 到底线（分割线 + 文案） */
.agent-list__more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px 0 6px;
  font-size: 12px;
  color: var(--tk-text-tertiary);
}

.agent-list__bottom {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px 10px;
}

.agent-list__bottom::before,
.agent-list__bottom::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--tk-border);
}

.agent-list__bottom-text {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  white-space: nowrap;
}

/* ── Agent 卡片（emil：进入 stagger + 指示条选中态 + hover 反馈） ── */
.agent-card-item {
  padding: 10px 14px 8px;
  cursor: pointer;
  user-select: none;
  /* 进入动画：stagger（--i 由模板注入）——transition 而非 keyframes（可中断） */
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 280ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 280ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
  transition-delay: calc(var(--i) * 35ms);
  border-radius: 12px;
  position: relative;
}
.agent-list[data-mounted='true'] .agent-card-item {
  opacity: 1;
  transform: translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  .agent-card-item {
    opacity: 1;
    transform: none;
    transition: none;
    transition-delay: 0ms;
  }
}
.agent-card-item:active {
  transform: scale(0.99);
}
@media (hover: hover) and (pointer: fine) {
  .agent-card-item:hover {
    background: var(--tk-bg-secondary);
  }
}
/* 选中态：accent 淡色 + 左侧指示条 */
.agent-card-item.selected {
  background: rgba(0, 122, 255, 0.07);
}
.agent-card-item.selected::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 3px;
  border-radius: 2px;
  background: var(--tk-accent);
}

/* Row 1: avatar + info */
.agent-card-item__row1 {
  display: flex;
  align-items: center;
  gap: 10px;
}

.agent-card-item__avatar {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--tk-accent);
  color: #fff;
  overflow: hidden;
  margin-bottom: 5px;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.08);
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
  font-weight: 600;
  color: var(--tk-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 130px;
}

.agent-card-item__profile-text {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 90px;
}

/* 描述：名字下方——单行省略（纯 CSS——不改文本） */
.agent-card-item__desc {
  margin-top: 2px;
  font-size: 11px;
  color: var(--tk-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-card-item__name-spacer {
  flex: 1;
}

/* tag：胶囊（与 SaBadge 统一） */
.agent-card-item__tag {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  flex-shrink: 0;
  letter-spacing: 0.2px;
}
.tag-default {
  background: var(--tk-accent);
  color: #fff;
}
.tag-frozen {
  background: var(--tk-bg-secondary);
  color: var(--tk-text-secondary);
}

/* ── Row 2: 操作按钮行 ── */
.agent-card-item__actions {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
  transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1);
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
  border-radius: 6px;
  color: var(--tk-text-tertiary);
  cursor: pointer;
  transition: background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 150ms cubic-bezier(0.23, 1, 0.32, 1);
}
.agent-card-item__action:active {
  transform: scale(0.93);
}
@media (hover: hover) and (pointer: fine) {
  .agent-card-item__action:hover {
    background: var(--tk-bg-secondary);
    color: var(--tk-accent);
  }
}
</style>
