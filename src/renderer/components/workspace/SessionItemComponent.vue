<template>
  <div
    class="session-item"
    :class="{
      'session-item--active': active,
      'session-item--pending': pending,
      'session-item--expanded': expanded && hasToolCalls
    }"
    @click="onClick"
  >
    <div class="session-item__icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    </div>
    <div class="session-item__info">
      <div class="session-item__title-row">
        <div class="session-item__title">{{ session.title || '新对话' }}</div>
        <div v-if="processing" class="session-item__indicator" />
      </div>
      <div class="session-item__meta">
        <span class="session-item__time">{{ formatTime }}</span>
      </div>

      <!-- 工具调用 todo list -->
      <Transition name="tool-expand">
        <div v-if="hasToolCalls" class="session-item__tools">
          <div
            v-for="tc in toolCalls"
            :key="tc.toolCallId"
            class="tool-item"
          >
            <span class="tool-item__status">{{ tc.status === 'done' ? '✅' : '⏳' }}</span>
            <span class="tool-item__name">{{ getToolDisplayName(tc.toolName) }}</span>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Session } from '@/defines/models/session'
import { useChatStore } from '@/renderer/stores/chat-store'
import { getToolDisplayName } from '@/renderer/utils/tool-display'

const props = defineProps<{
  session: Session
  active: boolean
  pending?: boolean
  processing?: boolean
}>()

const emit = defineEmits<{
  select: [sessionId: string]
}>()

const chatStore = useChatStore()
const expanded = ref(false)

const formatTime = computed(() => {
  const now = Date.now()
  const diff = now - props.session.updatedAt
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return new Date(props.session.updatedAt).toLocaleDateString('zh-CN')
})

const toolCalls = computed(() => {
  return chatStore.toolCallsBySession[props.session.id] ?? []
})

const hasToolCalls = computed(() => toolCalls.value.length > 0)

function onClick() {
  expanded.value = !expanded.value
  emit('select', props.session.id)
}
</script>

<style scoped>
.session-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s;
  margin: 1px 8px;
}

.session-item:hover {
  background: var(--sa-bg-secondary, #f5f5f7);
}

.session-item--active {
  background: var(--sa-bg-secondary, #f5f5f7);
}

.session-item__icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--sa-accent, #007aff);
  color: #fff;
}

.session-item__info {
  flex: 1;
  min-width: 0;
}

.session-item__title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.session-item__title {
  font-size: 14px;
  font-weight: 500;
  color: var(--sa-text-primary, #1d1d1f);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity 0.25s ease;
}

.session-item--pending .session-item__title {
  opacity: 0;
}

.session-item__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.session-item__time {
  font-size: 12px;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.session-item--active .session-item__title {
  color: var(--sa-accent, #007aff);
}

.session-item__indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--sa-accent, #007aff);
  flex-shrink: 0;
  animation: session-pulse 1.4s ease-in-out infinite;
}

@keyframes session-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.1); }
}

/* ── Tool call todo list ── */

.session-item__tools {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--sa-border, #d2d2d7);
}

.tool-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  line-height: 1.4;
}

.tool-item__name {
  color: var(--sa-text-secondary, #86868b);
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 11px;
}

.tool-item__status {
  flex-shrink: 0;
  font-size: 12px;
}

/* 展开/收起动画 */
.tool-expand-enter-active {
  transition: all 0.3s ease-out;
}
.tool-expand-leave-active {
  transition: all 0.2s ease-in;
}
.tool-expand-enter-from,
.tool-expand-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
  padding-top: 0;
  border-top-width: 0;
  overflow: hidden;
}
.tool-expand-enter-to,
.tool-expand-leave-from {
  opacity: 1;
  max-height: 200px;
}
</style>
