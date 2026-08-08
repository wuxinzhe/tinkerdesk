<template>
  <div class="message-row" :class="`message-row--${bubbleSideClass}`">
    <div class="message-body">

      <!-- ── 气泡容器（user/assistant 文本类 + 工具调用）─── -->
      <div v-if="showBubble" class="message-bubble"
        :class="[`bubble--${bubbleStyleClass}`, { 'bubble--streaming': isStreaming }]" @click="toggleTimestamp">
        <!-- assistant_text → Markdown 实时渲染 + 流式接收区 -->
        <template v-if="isAssistantText">

          <!-- 实时 Markdown 渲染（content 持续积累；MarkdownRender 根自带 markdown-body——不再外层包裹） -->
          <MarkdownRender
            v-if="!!message.content"
            :content="message.content"
            :breaks="true"
            :highlight-code="true"
            :render-links="false"
          />

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

        <!-- assistant_hybrid → 文本+工具混合卡片（content Markdown + 工具树） -->
        <template v-else-if="isHybrid">
          <HybridCard :message="message" :is-streaming="isStreaming" :pending-buffer="pendingBuffer" />
        </template>

        <!-- assistant_tool_call → 纯工具调用卡片（工具树为主） -->
        <template v-else-if="isToolCall">
          <ToolCallCard :message="message" :is-streaming="isStreaming" :pending-buffer="pendingBuffer" />
        </template>

        <!-- user_message / 兜底 → 纯文本 -->
        <template v-else>
          {{ message.content }}
        </template>
      </div>

      <!-- ── 时间戳（SVG 按钮 + 时间） ── -->
      <div class="message-timestamp" :class="{ visible: showTimestamp }">
        <button
          v-if="canSpeak"
          class="ts-btn"
          title="朗读本条消息"
          @click.stop="speakContent"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="7,4 20,12 7,20" fill="currentColor" stroke="none" />
          </svg>
        </button>
        <span class="message-timestamp__time">{{ formatTime(message.timestamp) }}</span>
        <button v-if="message.conversationId" class="ts-btn" title="查看对话详情"
          @click.stop="openConversationDetail(message.sessionId, message.conversationId)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="8" y1="9" x2="16" y2="9" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="13" y2="17" />
          </svg>
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
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownRender from '@/renderer/components/MarkdownRender.vue'
import ApprovalCard from '@/renderer/components/chat/ApprovalCard.vue'
import type { Message } from '@/renderer/api/types'
import ClarifyCard from '@/renderer/components/chat/ClarifyCard.vue'
import ToolCallCard from './ToolCallCard.vue'
import HybridCard from './HybridCard.vue'
import { inferMessageTypeFromRole } from '@/renderer/utils/message-utils'
import { markdownToPlainText } from '@/renderer/utils/markdown-to-text'

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

// ── TTS 朗读（assistant 文本/混合消息——时间戳区 🔊 按钮） ──

/** 可朗读：assistant_text / assistant_hybrid 且有内容 */
const canSpeak = computed(() =>
  (isAssistantText.value || isHybrid.value) && !!props.message.content
)
const speakingAudio = ref<HTMLAudioElement | null>(null)

async function speakContent() {
  const raw = props.message.content
  if (!raw) return
  try {
    // TTS 前清洗：markdown → 纯文本（表格整体删除——TTS 无法朗读）
    const text = markdownToPlainText(raw)
    if (!text) return
    const { audio } = await window.api.voice.ttsSpeak(text)
    if (!audio) return
    const src = audio.startsWith('data:') ? audio : `data:audio/mp3;base64,${audio}`
    speakingAudio.value?.pause()
    const a = new Audio(src)
    speakingAudio.value = a
    await a.play()
  } catch (e) {
    console.error('TTS 播放失败', e)
  }
}

onBeforeUnmount(() => {
  speakingAudio.value?.pause()
})

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
const isHybrid = computed(() => effectiveType.value === 'assistant_hybrid')
const isApprovalRequest = computed(() => effectiveType.value === 'approval_request')
const isClarifyRequest = computed(() => effectiveType.value === 'clarify_request')

/** 是否需要气泡容器（文本类消息） */
const showBubble = computed(() =>
  isUserNormal.value || isAssistantText.value || isToolCall.value || isHybrid.value || !props.message.messageType
)

/** 流式接收区：isStreaming 且有 buffer 时显示原始文本 */
const showStreamingReceiver = computed(() =>
  props.isStreaming && !!props.pendingBuffer
)

/** 气泡行对齐方向：user → right, assistant → left */
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
  background: var(--sa-bg-bubble-assistant, #ececed);
  color: var(--sa-text-primary, #1d1d1f);
  border-bottom-left-radius: 4px;
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

/* 时间戳文本（与按钮区分——hover 后可见） */
.message-timestamp__time {
  color: var(--sa-text-tertiary, #aeaeb2);
}

/* 时间戳按钮（SVG 图标——统一样式；父容器 pointer-events:none——必须显式 auto 才能点） */
.ts-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  background: none;
  border: none;
  padding: 0;
  border-radius: 4px;
  color: var(--sa-text-tertiary, #aeaeb2);
  cursor: pointer;
  pointer-events: auto;   /* 覆盖 .message-timestamp 的 pointer-events: none */
  opacity: 0.75;
  transition: opacity 0.15s, color 0.15s, background 0.15s;
}

.ts-btn:hover {
  opacity: 1;
  color: var(--sa-accent, #007aff);
  background: var(--sa-bg-selected, rgba(0, 122, 255, 0.08));
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
  background: var(--sa-destructive, #ff3b30);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
