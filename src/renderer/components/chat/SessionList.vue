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

    <div class="sl-list">
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
import { SaSkeleton } from '@/renderer/components'

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

/* ── Session loading ── */
async function loadSessions() {
  loading.value = true
  try {
    sessions.value = await sessionsApi.list(props.profile)
  } catch { /* silent */
  } finally {
    loading.value = false
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

onMounted(() => {
  loadSessions()
  window.addEventListener('session-title-updated', handleSessionTitleUpdated)
})

onUnmounted(() => {
  window.removeEventListener('session-title-updated', handleSessionTitleUpdated)
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
