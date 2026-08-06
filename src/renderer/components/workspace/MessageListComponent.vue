<template>
  <div
    ref="listRef"
    class="message-list"
    @scroll="onScroll"
  >
    <!-- 加载更多按钮 -->
    <div v-if="hasMore && messages.length > 0" class="message-list__load-more">
      <button
        class="message-list__load-btn"
        :disabled="loadingMore"
        @click="$emit('load-more')"
      >
        <SaSpinner v-if="loadingMore" size="small" />
        <template v-else>加载更多消息</template>
      </button>
    </div>

    <!-- 空状态 -->
    <div v-if="messages.length === 0 && !isStreaming" class="message-list__empty">
      <div class="message-list__empty-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      </div>
      <p class="message-list__empty-text">开始对话</p>
      <p class="message-list__empty-hint">发送消息以开始与 AI 助手对话</p>
    </div>

    <!-- 消息列表（含流式占位消息） -->
    <TransitionGroup name="message">
      <div v-for="(msg, idx) in visibleMessages" :key="msgKey(msg, idx)" class="message-row">
        <MessageBubbleComponent
          :message="msg"
          :is-streaming="msg.isStreaming ?? false"
          :is-last="idx === visibleMessages.length - 1"
          :pending-buffer="msg.isStreaming ? pendingBuffer : ''"
          @approve="(id: string) => $emit('approve', id)"
          @reject="(id: string) => $emit('reject', id)"
          @auto-approve="(id: string) => $emit('auto-approve', id)"
          @deleted="$emit('deleted')"
        />
      </div>
    </TransitionGroup>

    <!-- 底部锚点用于自动滚动 -->
    <div ref="bottomRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import type { Message } from '@/renderer/api/types'
import MessageBubbleComponent from './MessageBubbleComponent.vue'
import { SaSpinner } from '@/renderer/components'

/** UI 中展示的消息类型白名单 */
const DISPLAY_TYPES = new Set([
  'user_normal',
  'assistant_text',
  'assistant_hybrid',
  'approval_request',
  'clarify_request'
])

const props = withDefaults(defineProps<{
  messages: Message[]
  streamingContent?: string
  streamingReasoning?: string
  isStreaming?: boolean
  sessionId?: string | null
  hasMore?: boolean
  loadingMore?: boolean
  pendingBuffer?: string
}>(), {
  streamingContent: '',
  streamingReasoning: '',
  isStreaming: false,
  sessionId: null,
  hasMore: false,
  loadingMore: false,
  pendingBuffer: ''
})

/**
 * TransitionGroup key 兜底：实时推送消息（approval/assistant）服务端 id 可能为 0（未落库），
 * 历史加载消息 id 为 DB 自增。id 有效用 id，否则用会话+时间戳+类型+序号兜底保证唯一。
 */
function msgKey(msg: Message, idx: number): string {
  if (msg.id != null && msg.id !== '') return String(msg.id)
  return `${msg.sessionId ?? ''}_${msg.timestamp ?? idx}_${msg.messageType ?? ''}_${idx}`
}

defineEmits<{
  'load-more': []
  approve: [toolCallId: string]
  reject: [toolCallId: string]
  'auto-approve': [toolCallId: string]
  deleted: []
}>()

const listRef = ref<HTMLDivElement | null>(null)
const bottomRef = ref<HTMLDivElement | null>(null)

// 用户是否手动上滚
const userScrolledUp = ref(false)

/** 按 messageType 过滤后的可见消息（含 isStreaming=true 的占位消息） */
const visibleMessages = computed(() =>
  props.messages.filter(m => DISPLAY_TYPES.has(m.messageType as string)
    || (m.messageType == null && m.role === 'user'))
)

// ── 自动滚动 ──

function scrollToBottom() {
  nextTick(() => {
    bottomRef.value?.scrollIntoView()
  })
}

/** 会话切换标记：切换后首批消息直接拉到底部（不做顶部对齐/动画） */
let sessionJustSwitched = false

/** 根据最后一条消息的高度决定滚动位置：超长回复滚动到气泡顶部（距视口 16px），否则底部 */
function scrollToNewMessage() {
  nextTick(() => {
    const container = listRef.value
    if (!container) {
      scrollToBottom()
      return
    }

    const msgs = visibleMessages.value
    const lastMsg = msgs[msgs.length - 1]
    if (!lastMsg || lastMsg.messageType !== 'assistant_text') {
      scrollToBottom()
      return
    }

    const rows = container.querySelectorAll('.message-row')
    const lastRow = rows[rows.length - 1] as HTMLElement | null
    if (!lastRow) {
      scrollToBottom()
      return
    }

    const bubbleHeight = lastRow.offsetHeight
    const viewportHeight = container.clientHeight

    if (bubbleHeight > viewportHeight * 0.7) {
      // 超长回复：滚动到气泡顶部（scroll-margin-top: 16px 保证距顶部 16px），瞬时无动画
      lastRow.scrollIntoView({ block: 'start' })
    } else {
      scrollToBottom()
    }
  })
}

function onScroll() {
  if (!listRef.value) return
  const el = listRef.value
  const threshold = 80
  const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  userScrolledUp.value = !isAtBottom
}

// 新消息到达时自动滚动（会话切换后的首批消息直接拉到底部，不触发顶部对齐）
watch(
  () => props.messages.length,
  () => {
    if (sessionJustSwitched) {
      sessionJustSwitched = false
      scrollToBottom()
      return
    }
    if (!userScrolledUp.value) {
      scrollToNewMessage()
    }
  }
)

// 切换会话：直接拉到底部（无动画），标记跳过首批消息的顶部对齐
watch(
  () => props.sessionId,
  () => {
    sessionJustSwitched = true
    userScrolledUp.value = false
    scrollToBottom()
  }
)

// 流式内容变化且用户在底部时自动滚动
watch(
  () => props.streamingContent,
  () => {
    if (!userScrolledUp.value && listRef.value) {
      scrollToBottom()
    }
  }
)

// 开始流式时滚动到底部
watch(
  () => props.isStreaming,
  (v) => {
    if (v) {
      userScrolledUp.value = false
      scrollToBottom()
    } else if (!userScrolledUp.value) {
      // 流式结束：占位转正原地更新（messages.length 不变），需在此触发超长回复顶部对齐
      scrollToNewMessage()
    }
  }
)

onMounted(() => {
  scrollToBottom()
})

defineExpose({
  scrollToBottom
})
</script>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overscroll-behavior: contain;
}

/* 超长回复顶部对齐时，气泡距视口顶部 16px（配合 scrollIntoView block:start） */
.message-row {
  scroll-margin-top: 16px;
}

/* ── 加载更多 ── */

.message-list__load-more {
  display: flex;
  justify-content: center;
  padding: 8px 16px 16px;
}

.message-list__load-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  font-size: 13px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif;
  color: var(--sa-accent, #007aff);
  background: transparent;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.message-list__load-btn:hover:not(:disabled) {
  background: var(--sa-bg-secondary, #f5f5f7);
}

.message-list__load-btn:disabled {
  color: var(--sa-text-tertiary, #aeaeb2);
  cursor: not-allowed;
}

/* ── 空状态 ── */

.message-list__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--sa-text-tertiary, #aeaeb2);
  gap: 8px;
  padding: 40px;
}

.message-list__empty-icon {
  opacity: 0.4;
  margin-bottom: 8px;
}

.message-list__empty-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--sa-text-secondary, #86868b);
  margin: 0;
}

.message-list__empty-hint {
  font-size: 13px;
  color: var(--sa-text-tertiary, #aeaeb2);
  margin: 0;
}

/* ── 消息入场动画（新消息/msg.id 变化时触发） ── */

.message-enter-active {
  animation: fadeInUp 0.3s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
