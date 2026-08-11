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
      <!-- 阶段图标（优先级：等审批 > 等回答 > 工具 > 工作中 > 完成 > 空闲）——切换淡入淡出（低调不抢注意力） -->
      <Transition name="icon-fade" mode="out-in">
        <!-- 等审批：黄色感叹号（等待用户操作——区别于工作中） -->
        <span v-if="stage === 'approval'" key="approval" class="session-item__stage session-item__stage--wait" title="等待审批">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="7" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
        <!-- 等回答（clarify）：问号 -->
        <span v-else-if="stage === 'clarify'" key="clarify" class="session-item__stage session-item__stage--wait" title="等待你的回答">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
        <!-- 工作中：圆环 spinner（LLM 思考——Claude 风格） -->
        <span v-else-if="stage === 'working'" key="working" class="session-item__spinner" />
        <!-- 工具调用：齿轮旋转（区别于 LLM 思考——持续旋转） -->
        <span v-else-if="stage === 'tool'" key="tool" class="session-item__gear" title="工具执行中">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </span>
        <!-- 完成提醒：非 active 会话 complete 后（stage=completed）——图标显示 ✓ -->
        <svg v-else-if="stage === 'completed' && !active" key="done" class="session-item__done-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
        <svg v-else key="idle" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      </Transition>
    </div>
    <div class="session-item__info">
      <div class="session-item__title-row">
        <div class="session-item__title">
          {{ session.title || '新对话' }}
        </div>
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
import type { Session } from '@/renderer/api/types'
import { useChatStore } from '@/renderer/stores/chat-store'
import { getToolDisplayName } from '@/renderer/utils/tool-display'

const props = defineProps<{
  session: Session
  active: boolean
  pending?: boolean
  /** 会话阶段（chat-store sessionStage：approval=等审批 / clarify=等回答 / working=LLM思考 / tool=工具执行 / completed=完成 / idle） */
  stage?: 'working' | 'tool' | 'approval' | 'clarify' | 'completed' | 'idle'
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
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 10px;
  margin: 2px 8px;
  /* emil：指定属性过渡 + 强 ease-out + 按压反馈 */
  transition: background-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.session-item:active {
  transform: scale(0.98);
}
@media (hover: hover) and (pointer: fine) {
  .session-item:hover {
    background: var(--tk-bg-secondary);
  }
}

/* 选中态（HIG Sidebars）：accent 8% 背景 + 左侧指示条 */
.session-item--active {
  background: var(--tk-bg-selected);
}
.session-item--active::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 25%;
  bottom: 25%;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--tk-accent);
}

.session-item__icon {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: var(--tk-accent);
  color: #fff;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.08);
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
  font-weight: 600;
  color: var(--tk-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1);
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
  font-size: 11px;
  color: var(--tk-text-tertiary);
}

.session-item--active .session-item__title {
  color: var(--tk-accent);
}

/* 阶段图标切换过渡（淡入淡出 + 微缩放——低调不抢注意力） */
.icon-fade-enter-active,
.icon-fade-leave-active {
  transition: opacity 100ms ease, transform 100ms ease;
}
.icon-fade-enter-from,
.icon-fade-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

/* 阶段图标（等审批/等回答——等待用户操作：黄色系静止图标，区别于工作中 spinner） */
.session-item__stage {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.session-item__stage--wait {
  color: #ffd166; /* 黄色——等待用户操作（审批/回答） */
}

/* 处理中：图标位圆环 spinner（Claude 风格——替换气泡图标） */
.session-item__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: session-spin 0.8s linear infinite;
}

/* 工具调用：齿轮持续旋转（区别于 LLM 思考的 spinner） */
.session-item__gear {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  animation: session-spin 1.6s linear infinite;
}

@keyframes session-spin {
  to { transform: rotate(360deg); }
}

/* 完成提醒标记（非 active——图标位白色 ✓） */
.session-item__done-icon {
  color: #fff;
  flex-shrink: 0;
}

/* ── Tool call todo list ── */

.session-item__tools {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--tk-border-light);
}

.tool-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  line-height: 1.4;
}

.tool-item__name {
  color: var(--tk-text-secondary);
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 11px;
}

.tool-item__status {
  flex-shrink: 0;
  font-size: 12px;
}

/* 展开/收起动画（emil：指定属性 + 强 ease-out） */
.tool-expand-enter-active {
  transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1),
    max-height 240ms cubic-bezier(0.23, 1, 0.32, 1),
    margin-top 240ms cubic-bezier(0.23, 1, 0.32, 1),
    padding-top 240ms cubic-bezier(0.23, 1, 0.32, 1);
}
.tool-expand-leave-active {
  transition: opacity 140ms cubic-bezier(0.23, 1, 0.32, 1),
    max-height 180ms cubic-bezier(0.23, 1, 0.32, 1),
    margin-top 180ms cubic-bezier(0.23, 1, 0.32, 1),
    padding-top 180ms cubic-bezier(0.23, 1, 0.32, 1);
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
