<template>
  <div class="sl-inner">
    <div class="sl-header">
      <span class="sl-title">对话历史</span>
      <button class="sl-add-btn" title="新建对话" @click="onAddClick">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>

    <div class="sl-list" @scroll.passive="onScroll">
      <!-- 首次加载骨架屏 -->
      <div v-if="loading && sessions.length === 0" class="sl-skeleton">
        <div v-for="i in 5" :key="'s'+i" class="sl-skeleton-item">
          <SaSkeleton variant="circle" :circle-size="'28px'" />
          <div class="sl-skeleton-body">
            <SaSkeleton variant="text" :text-lines="1" height="14px" last-line-width="60%" />
            <SaSkeleton variant="text" :text-lines="1" height="11px" last-line-width="40%" />
          </div>
        </div>
      </div>

      <TransitionGroup v-else name="sl-item">
        <SessionItemComponent
          v-for="s in sessions"
          :key="s.id"
          :session="s"
          :active="s.id === activeSessionId"
          :pending="s.id === pendingSessionId"
          :processing="isProcessingBySession[s.id] ?? false"
          :completed="completedBySession[s.id] ?? false"
          @select="onSelect"
        />
      </TransitionGroup>

      <p v-if="sessions.length === 0 && !pendingSessionId" class="sl-empty">
        <span class="sl-empty__icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </span>
        <span class="sl-empty__text">暂无对话</span>
        <span class="sl-empty__hint">点击右上角 + 开启新对话</span>
      </p>

      <!-- 加载更多（向下滚动到底触发——旧会话 append） -->
      <div v-if="loadingMore" class="sl-more">
        <SaSpinner size="small" />
        <span>加载中…</span>
      </div>
      <div v-else-if="!hasMore && sessions.length > 0" class="sl-bottom">
        <span class="sl-bottom__text">凡事都有底线</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { Session } from '@/renderer/api/types'
import SessionItemComponent from '@/renderer/components/workspace/SessionItemComponent.vue'
import { useChatStore } from '@/renderer/stores/chat-store'
import { useSessionStore } from '@/renderer/stores/session-store'
import { sessionsApi } from '@/renderer/api/sessions-api'
import { SaSkeleton, SaSpinner } from '@/renderer/components'

const props = defineProps<{
  activeSessionId: string | null
  profile: string
}>()

const chatStore = useChatStore()
const isProcessingBySession = computed(() => chatStore.isProcessingBySession)

const emit = defineEmits<{
  select: [sessionId: string]
  'new-session': []
}>()

/* ── State ── */
const sessions = ref<Session[]>([])
const pendingSessionId = ref<string | null>(null)
const realIdMap = new Map<string, string>()
const loading = ref(false)

/* ── 分页加载（每页 20——向下滚动到底触发加载更多） ── */
const PAGE_SIZE = 20
const offset = ref(0)
const hasMore = ref(true)
const loadingMore = ref(false)

/* ── Session loading ── */
async function loadSessions() {
  loading.value = true
  offset.value = 0
  hasMore.value = true
  try {
    const list = await sessionsApi.list(props.profile, PAGE_SIZE, 0)
    sessions.value = list
    offset.value = list.length
    hasMore.value = list.length === PAGE_SIZE
  } catch { /* silent */
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    const list = await sessionsApi.list(props.profile, PAGE_SIZE, offset.value)
    sessions.value.push(...list)
    offset.value += list.length
    hasMore.value = list.length === PAGE_SIZE
  } catch { /* silent */
  } finally {
    loadingMore.value = false
  }
}

/** 向下滚动到底触发加载更多（新在上——旧会话 append 到底部） */
function onScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
    void loadMore()
  }
}

/* ── New session ── */
function onAddClick() {
  if (pendingSessionId.value) return
  const tempId = `pending_${Date.now()}`
  const now = Date.now()
  const pendingSession: Session = {
    id: tempId,
    title: '',
    createdAt: now,
    updatedAt: now,
    profile: props.profile,
    status: 'idle'
  }
  sessions.value.unshift(pendingSession)
  pendingSessionId.value = tempId
  emit('new-session')
}

function resolvePendingSession(tempId: string, realSession: Session) {
  const s = sessions.value.find(s => s.id === tempId)
  if (!s) return
  realIdMap.set(tempId, realSession.id)
  s.title = '新对话'
  s.updatedAt = realSession.updatedAt
  s.status = realSession.status
  pendingSessionId.value = null
}

function removePendingSession() {
  const tempId = pendingSessionId.value
  if (!tempId) return
  realIdMap.delete(tempId)
  const idx = sessions.value.findIndex(s => s.id === tempId)
  if (idx !== -1) sessions.value.splice(idx, 1)
  pendingSessionId.value = null
}

/* ── Select ── */
function onSelect(sessionId: string) {
  const realId = realIdMap.get(sessionId) ?? sessionId
  const session = sessions.value.find(s => s.id === sessionId) ?? null
  useSessionStore().setCurrentSession(session)
  emit('select', realId)
}

/* ── Title updates ── */
function handleSessionTitleUpdated(e: Event) {
  const { sessionId, title } = (e as CustomEvent).detail
  const s = sessions.value.find(s => s.id === sessionId)
  if (s) s.title = title
}

/* ── Lifecycle ── */
watch(() => props.profile, () => {
  loadSessions()
})

/* ── 完成提醒标记（非 active 会话 complete 后显示 ✓；切到该会话清除） ── */
const completedBySession = ref<Record<string, boolean>>({})

function handleConversationComplete(e: Event): void {
  const { sessionId } = (e as CustomEvent).detail ?? {}
  if (!sessionId) return
  // active 会话完成：用户在看——不需要提醒；非 active：标记提醒查看结果
  if (sessionId !== props.activeSessionId) {
    completedBySession.value[sessionId] = true
  }
}

// 切换到某会话 → 清除它的完成提醒（用户已在看）
watch(() => props.activeSessionId, (sid) => {
  if (sid) delete completedBySession.value[sid]
})

onMounted(() => {
  loadSessions()
  window.addEventListener('session-title-updated', handleSessionTitleUpdated)
  window.addEventListener('conversation-complete', handleConversationComplete)
})

onUnmounted(() => {
  window.removeEventListener('session-title-updated', handleSessionTitleUpdated)
  window.removeEventListener('conversation-complete', handleConversationComplete)
})

defineExpose({ pendingSessionId, loadSessions, resolvePendingSession, removePendingSession })
</script>

<style scoped>
.sl-inner {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.sl-header {
  padding: 16px 20px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}

.sl-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tk-text-secondary);
  letter-spacing: 0.5px;
}

/* 新建按钮（emil：主入口图标按钮——hairline 边框 + 白底浮起，与 Agent 列表加号同款） */
.sl-add-btn {
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--tk-bg-primary);
  border: 1px solid var(--tk-border-card);
  box-shadow: var(--tk-shadow-card);
  color: var(--tk-text-secondary);
  transition: background-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1),
    box-shadow 200ms cubic-bezier(0.23, 1, 0.32, 1);
}
.sl-add-btn:active {
  transform: scale(0.97);
}
@media (hover: hover) and (pointer: fine) {
  .sl-add-btn:hover {
    background: var(--tk-bg-secondary);
    color: var(--tk-accent);
    box-shadow: var(--tk-shadow-card-hover);
  }
}

.sl-list {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 8px;
}

/* 空态（与 SaEmpty 一致：图标柔和圆角容器 + 主/次文案） */
.sl-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 48px 16px;
  margin: 0;
}
.sl-empty__icon {
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
.sl-empty__text {
  font-size: 14px;
  font-weight: 600;
  color: var(--tk-text-primary);
}
.sl-empty__hint {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  margin-top: 2px;
}

/* 加载更多 / 到底线（分割线 + 文案） */
.sl-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 0;
  font-size: 12px;
  color: var(--tk-text-tertiary);
}

.sl-bottom {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px 10px;
}

.sl-bottom::before,
.sl-bottom::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--tk-border);
}

.sl-bottom__text {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  white-space: nowrap;
}

/* ── TransitionGroup（emil：指定属性 + 强 ease-out；离开时绝对定位避免挤位） ── */

.sl-item-enter-active {
  transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}
.sl-item-leave-active {
  transition: opacity 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
  position: absolute;
}
.sl-item-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}
.sl-item-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.sl-item-move {
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

/* ── 骨架屏 ── */
.sl-skeleton {
  display: flex;
  flex-direction: column;
  padding: 2px 0;
}

.sl-skeleton-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
}

.sl-skeleton-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
