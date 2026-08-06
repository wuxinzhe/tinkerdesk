<template>
  <div class="message-row" :class="`message-row--${bubbleSideClass}`">
    <div class="message-body">

      <!-- ── 气泡容器（user/assistant 文本类消息）─── -->
      <div v-if="showBubble" class="message-bubble"
        :class="[`bubble--${bubbleStyleClass}`, { 'bubble--streaming': isStreaming }]" @click="toggleTimestamp">
        <!-- assistant_text → Markdown 实时渲染 + 流式接收区 -->
        <template v-if="isAssistantText">

          <!-- 实时 Markdown 渲染（content 持续积累） -->
          <div v-if="!!message.content" class="markdown-body">
            <MarkdownRender :content="message.content" :breaks="true" :highlight-code="true" :render-links="false" />
          </div>

          <!-- 流式接收区：在 Markdown 下方，显示最新原始文本 -->
          <Transition name="collapse">
            <div v-if="showStreamingReceiver" class="streaming-receiver">
              <div class="streaming-receiver__header">
                📡 信息接收中…
              </div>
              <div ref="streamBodyRef" class="streaming-receiver__body">{{ pendingBuffer }}</div>
            </div>
          </Transition>
        </template>

        <!-- user_message / 兜底 → 纯文本 -->
        <template v-else>
          {{ message.content }}
        </template>

        <!-- assistant_tool_call → 工具调用内容（toolCall JSON：工具名 + 参数） -->
        <div v-if="isToolCall" class="tool-call-card">
          <div class="tool-call-card__header">🔧 工具调用</div>
          <pre class="tool-call-card__body">{{ prettyToolCall }}</pre>
        </div>
      </div>

      <!-- ── 时间戳 ── -->
      <div class="message-timestamp" :class="{ visible: showTimestamp }">
        <span>{{ formatTime(message.timestamp) }}</span>
        <button v-if="message.conversationId" class="conv-detail-btn" title="查看对话详情"
          @click.stop="openConversationDetail(message.sessionId, message.conversationId)">
          📋
        </button>
      </div>

      <!-- ── 发送状态（仅 user_message） ── -->
      <div v-if="isUserNormal" class="message-status">
        <template v-if="message.status === 'sending'">
          <span class="status-dot status-dot--sending" />
          发送中...
        </template>
        <template v-else-if="message.status === 'failed'">
          <span class="status-dot status-dot--failed" />
          发送失败
        </template>
      </div>

      <!-- ── 审批卡片 ── -->
      <ApprovalCard
        v-if="isApprovalRequest"
        :interaction-status="message.interactionStatus"
        :tool-name="message.toolName"
        :approval-arguments="message.approvalArguments"
        :tool-call-id="message.toolCallId ?? ''"
        @approve="emit('approve', $event)"
        @reject="emit('reject', $event)"
        @auto-approve="emit('auto-approve', $event)"
      />

      <!-- ── Clarify 提问卡片 ── -->
      <ClarifyCard
        v-if="isClarifyRequest"
        :question="message.clarifyQuestion ?? ''"
        :choices="message.clarifyChoices"
        :tool-call-id="message.toolCallId ?? ''"
        :session-id="message.sessionId"
        :submitted-content="message.content"
        :interaction-status="message.interactionStatus"
      />

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownRender from '@/renderer/components/MarkdownRender.vue'
import ApprovalCard from '@/renderer/components/chat/ApprovalCard.vue'
import type { Message } from '@/renderer/api/types'
import ClarifyCard from '@/renderer/components/chat/ClarifyCard.vue'
import { formatSmartTime } from '@/renderer/utils/date-utils'
import { inferMessageTypeFromRole } from '@/renderer/utils/message-utils'

const router = useRouter()

function openConversationDetail(sessionId: string | undefined, conversationId: string | undefined) {
  if (!sessionId || !conversationId) return
  router.push(`/workspace/chat/${sessionId}/conversation/${conversationId}`)
}

const props = withDefaults(defineProps<{
  message: Message
  isStreaming?: boolean
  isLast?: boolean
  pendingBuffer?: string
}>(), {
  isStreaming: false,
  isLast: false,
  pendingBuffer: ''
})

const emit = defineEmits<{
  approve: [toolCallId: string]
  reject: [toolCallId: string]
  'auto-approve': [toolCallId: string]
  deleted: []
}>()

// ── Timestamp ──

const showTimestamp = ref(false)

function toggleTimestamp() {
  showTimestamp.value = !showTimestamp.value
}

function formatTime(ts: number): string {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`

  if (isToday) return time
  if (isYesterday) return `昨天 ${time}`
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${time}`
}

/** 流式接收区 body 的 DOM 引用，用于自动滚动 */
const streamBodyRef = ref<HTMLDivElement | null>(null)

/** pendingBuffer 变化时自动滚动到最底部 */
watch(() => props.pendingBuffer, () => {
  nextTick(() => {
    streamBodyRef.value?.scrollTo({ top: streamBodyRef.value.scrollHeight, behavior: 'smooth' })
  })
})

// ── messageType 驱动渲染分类 ──

/** 当前消息的 messageType（兜底从 role 推断） */
const effectiveType = computed(() =>
  props.message.messageType || inferMessageTypeFromRole(props.message.role)
)

// ── 渲染分类标志位 ──

const isUserNormal = computed(() => effectiveType.value === 'user_normal')
const isAssistantText = computed(() => effectiveType.value === 'assistant_text')
const isToolCall = computed(() => effectiveType.value === 'assistant_tool_call')
const isApprovalRequest = computed(() => effectiveType.value === 'approval_request')
const isClarifyRequest = computed(() => effectiveType.value === 'clarify_request')

/** toolCall JSON 美化显示（{toolCallId: {name, arguments}} → 工具名 + 参数 JSON） */
const prettyToolCall = computed(() => {
  if (!props.message.toolCall) return ''
  try {
    const parsed = JSON.parse(props.message.toolCall as string) as Record<string, { name: string; arguments: unknown }>
    const entries = Object.entries(parsed)
    if (entries.length === 0) return props.message.toolCall as string
    const first = entries[0][1]
    const name = first?.name ?? ''
    const args = first?.arguments != null ? JSON.stringify(first.arguments, null, 2) : ''
    return name + (args ? '\n' + args : '')
  } catch {
    return props.message.toolCall as string
  }
})

/** 是否需要气泡容器（文本类消息） */
const showBubble = computed(() =>
  isUserNormal.value || isAssistantText.value || isToolCall.value || !props.message.messageType
)

/** 流式接收区：isStreaming 且有 buffer 时显示原始文本 */
const showStreamingReceiver = computed(() =>
  props.isStreaming && !!props.pendingBuffer
)

/** 完成态 Markdown 渲染：非流式、有内容时显示 */
const showFallbackMarkdown = computed(() =>
  isAssistantText.value && !props.isStreaming && !!props.message.content
)

/** 气泡对齐方向：user → right, assistant → left */
const bubbleSideClass = computed(() =>
  isUserNormal.value ? 'user' : 'assistant'
)

/** 气泡样式类 */
const bubbleStyleClass = computed(() =>
  isUserNormal.value ? 'user' : 'assistant'
)
</script>

<style scoped>
/* ── Row ── */

.message-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  max-width: 70%;
  min-width: 0;
  padding: 2px 0;
  scroll-margin-top: 5px;
}

/* 窄 L3 容器（如平板 + 侧栏展开）时气泡拉宽 */
@container l3-content (max-width: 560px) {
  .message-row {
    max-width: 100%;
  }
}

.message-row--assistant {
  align-self: flex-start;
}

.message-row--user {
  margin-left: auto;
  flex-direction: row-reverse;
}

/* ── Body ── */

.message-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 100%;
  min-width: 0;
}

/* ── Bubble ── */

.message-bubble {
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
  transition: background 0.15s, border-radius 0.15s;
}

.message-bubble:hover {
  cursor: pointer;
}

.bubble--user {
  background: var(--sa-accent, #007aff);
  color: #fff;
  border-bottom-right-radius: 4px;
  white-space: pre-wrap;
}

.bubble--assistant {
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-text-primary, #1d1d1f);
  border-bottom-left-radius: 4px;
}

/* ── 工具调用卡片（assistant_tool_call） ── */

.tool-call-card {
  font-size: 12px;
  line-height: 1.6;
}

.tool-call-card__header {
  font-weight: 600;
  color: var(--sa-text-secondary, #86868b);
  margin-bottom: 6px;
}

.tool-call-card__body {
  margin: 0;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 8px;
  color: var(--sa-text-primary, #1d1d1f);
  white-space: pre-wrap;
  word-break: break-all;
  font-family: var(--sa-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

/* ── 气泡容器（user/assistant 文本类消息）─── */


.markdown-body {
  line-height: 1.6;
}

/* 收紧段落间距，避免全文单 MarkdownRender 时段落 gap 过大 */
/* ⚠ 优先级必须高于 MarkdownRender 内部的 :deep(p)，用 .message-bubble 加一层类 */
.message-bubble :deep(.markdown-body p) {
  margin: 0.3em 0;
}

.message-bubble :deep(.markdown-body > :first-child) {
  margin-top: 0;
}

.message-bubble :deep(.markdown-body > :last-child) {
  margin-bottom: 0;
}

/* ── 流式接收区 ── */

.streaming-receiver {
  margin-top: 16px;             /* 与上方 Markdown 渲染区的间距 */
  background: var(--sa-bg-tertiary, #e8e8ed);
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 8px;
  overflow: hidden;
}

.streaming-receiver__header {
  font-size: 12px;
  color: var(--sa-text-tertiary, #aeaeb2);
  padding: 6px 10px 2px;
}

.streaming-receiver__body {
  font-size: 13px;
  line-height: 1.4;
  color: var(--sa-text-secondary, #86868b);
  padding: 6px 10px;
  max-height: 67px;         /* 3 行 × 18.2px + padding 12px ≈ 67px */
  overflow: hidden;         /* 思考气泡：隐藏滚动条且不允许滚动 */
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
}


/* ── Collapse transition ── */

.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.25s ease;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  margin-bottom: 0;
  overflow: hidden;
}

/* ── Timestamp ── */

.message-timestamp {
  font-size: 11px;
  color: var(--sa-text-tertiary, #aeaeb2);
  line-height: 1;
  padding: 0 4px 0 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

.message-timestamp.visible {
  opacity: 1;
}

.conv-detail-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  opacity: 0.6;
  transition: opacity 0.15s;
  pointer-events: auto;
}

.conv-detail-btn:hover {
  opacity: 1;
}

/* ── 发送状态 ── */

.message-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--sa-text-tertiary, #aeaeb2);
  padding: 0 4px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.status-dot--sending {
  background: var(--sa-accent, #007aff);
  animation: pulse 1.2s infinite;
}

.status-dot--failed {
  background: #ff3b30;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
