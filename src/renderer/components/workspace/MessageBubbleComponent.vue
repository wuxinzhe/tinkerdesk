<template>
  <div class="message-row" :class="`message-row--${bubbleSideClass}`">
    <div class="message-body">
      <!-- ── 气泡容器（user/assistant 文本类 + 工具调用）─── -->
      <div
        v-if="showBubble" class="message-bubble"
        :class="[`bubble--${bubbleStyleClass}`, { 'bubble--streaming': isStreaming }]" @click="toggleTimestamp"
      >
        <!-- 思考过程（仅 showReasoning=true 时显示——对话详情页；气泡内 content 上方） -->
        <div v-if="showReasoning && message.reasoningContent" class="bubble-reasoning">
          <div class="bubble-reasoning__head" @click.stop="toggleBubbleReasoning">
            <svg class="bubble-reasoning__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span class="bubble-reasoning__label">思考过程</span>
            <svg
              class="bubble-reasoning__arrow"
              :class="{ 'bubble-reasoning__arrow--open': bubbleReasoningOpen }"
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          <pre v-if="bubbleReasoningOpen" class="bubble-reasoning__body">{{ message.reasoningContent }}</pre>
        </div>

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
                <span class="streaming-receiver__dot" />
                接收中
              </div>
              <div ref="streamBodyRef" class="streaming-receiver__body">
                {{ pendingBuffer }}
              </div>
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

        <!-- user_message / 兜底 → 文本 + 媒体附件（[Image attached at: media/xxx] → 真实文件渲染） -->
        <template v-else>
          <div v-if="mediaAttachments.length" class="bubble-media">
            <img
              v-for="att in mediaAttachments.filter((a) => a.type === 'Image')"
              :key="att.relPath"
              class="bubble-media__img"
              :src="mediaUrl(att.relPath)"
              alt="图片"
            />
            <audio
              v-for="att in mediaAttachments.filter((a) => a.type === 'Audio')"
              :key="att.relPath"
              class="bubble-media__audio"
              :src="mediaUrl(att.relPath)"
              controls
            />
            <video
              v-for="att in mediaAttachments.filter((a) => a.type === 'Video')"
              :key="att.relPath"
              class="bubble-media__video"
              :src="mediaUrl(att.relPath)"
              controls
            />
          </div>
          <template v-if="textWithoutMedia">{{ textWithoutMedia }}</template>
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

      <!-- ── 发送状态（仅 user_message——body 内气泡下方） ── -->
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
      </div>

      <!-- ── 时间戳（SVG 按钮 + 时间）──
           统一 hover 显示（触屏点击）；行级——气泡旁（assistant 行最右 / user 气泡左） -->
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
        <button
          v-if="message.conversationId" class="ts-btn" title="查看对话详情"
          @click.stop="openConversationDetail(message.sessionId, message.conversationId)"
        >
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

/* ── 媒体附件解析（[Image/Audio/Video attached at: media/xxx] → 真实文件渲染） ── */
interface MediaAttachment { type: 'Image' | 'Audio' | 'Video' | 'File'; relPath: string }
const MEDIA_ATTACH_RE = /\[(Image|Audio|Video|File) attached at: ([^\]]+)\]/g

const mediaAttachments = computed<MediaAttachment[]>(() => {
  const content = props.message.content ?? ''
  const result: MediaAttachment[] = []
  const re = new RegExp(MEDIA_ATTACH_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    result.push({ type: m[1] as MediaAttachment['type'], relPath: m[2].trim() })
  }
  return result
})

/** 去掉媒体标记后的剩余文本 */
const textWithoutMedia = computed(() =>
  (props.message.content ?? '').replace(MEDIA_ATTACH_RE, '').trim()
)

/** 相对路径 → app-media:// 协议 URL（main 只读 media 目录） */
function mediaUrl(relPath: string): string {
  return `app-media://${relPath.replace(/\\/g, '/')}`
}

function openConversationDetail(sessionId: string | undefined, conversationId: string | undefined) {
  if (!sessionId || !conversationId) return
  router.push(`/workspace/chat/${sessionId}/conversation/${conversationId}`)
}

const props = withDefaults(defineProps<{
  message: Message
  isStreaming?: boolean
  isLast?: boolean
  pendingBuffer?: string
  /** 气泡内显示思考过程区块（仅对话详情页传入 true——普通聊天不显示） */
  showReasoning?: boolean
}>(), {
  isStreaming: false,
  isLast: false,
  pendingBuffer: '',
  showReasoning: false
})

/** 气泡内思考过程展开状态（按消息 id——组件实例级） */
const bubbleReasoningOpen = ref(false)

function toggleBubbleReasoning(): void {
  bubbleReasoningOpen.value = !bubbleReasoningOpen.value
}

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
/* ── 媒体附件（图片/音频/视频——app-media:// 真实文件渲染） ── */

.bubble-media {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 2px;
}
.bubble-media__img {
  /* 展示时：max-height 限制高度——宽度按比例自适应（不写死 max-width） */
  max-width: 100%;
  max-height: 260px;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 8px;
  display: block;
}
.bubble-media__audio,
.bubble-media__video {
  max-width: 260px;
  border-radius: 8px;
}
.bubble-media__video {
  max-height: 220px;
}

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

/* ── Bubble（emil：指定属性过渡 + 强 ease-out） ── */

.message-bubble {
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
  transition: background-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    border-radius 180ms cubic-bezier(0.23, 1, 0.32, 1);
}

/* user：柔和渐变（iOS 风格）+ 尾部小角 */
.bubble--user {
  background: linear-gradient(135deg, var(--tk-accent) 0%, var(--tk-accent-active) 100%);
  color: #fff;
  border-bottom-right-radius: 5px;
  white-space: pre-wrap;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.08);
}

/* assistant：白底浮起（hairline 边框 + 极淡阴影） */
.bubble--assistant {
  background: var(--tk-bg-primary);
  color: var(--tk-text-primary);
  border: 1px solid var(--tk-border-card);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03), 0 2px 8px rgba(0, 0, 0, 0.03);
  border-bottom-left-radius: 5px;
}

/* 流式中的 assistant 气泡：呼吸边框 */
.bubble--assistant.bubble--streaming {
  border-color: rgba(0, 122, 255, 0.25);
}

.message-bubble :deep(.markdown-body p) {
  margin: 0.3em 0;
}

.message-bubble :deep(.markdown-body > :first-child) {
  margin-top: 0;
}

/* ── 气泡内思考过程（仅对话详情：showReasoning=true） ── */

.bubble-reasoning {
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--tk-border-card);
}

.bubble-reasoning__head {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  color: var(--tk-warning);
}

.bubble-reasoning__icon {
  flex-shrink: 0;
}

.bubble-reasoning__label {
  font-weight: 500;
}

.bubble-reasoning__arrow {
  margin-left: auto;
  display: flex;
  transition: transform 220ms cubic-bezier(0.23, 1, 0.32, 1);
}

.bubble-reasoning__arrow--open {
  transform: rotate(180deg);
}

.bubble-reasoning__body {
  margin: 8px 0 0;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--tk-text-secondary);
  max-height: 240px;
  overflow-y: auto;
}

/* user 渐变气泡内的思考过程：半透明白（渐变底上 warning 橙不可读） */
.bubble--user .bubble-reasoning {
  border-bottom-color: rgba(255, 255, 255, 0.25);
}

.bubble--user .bubble-reasoning__head {
  color: rgba(255, 255, 255, 0.92);
}

.bubble--user .bubble-reasoning__body {
  color: rgba(255, 255, 255, 0.85);
}

.message-bubble :deep(.markdown-body > :last-child) {
  margin-bottom: 0;
}

/* ── 流式接收区（emil：极简「接收中」+ 呼吸圆点） ── */

.streaming-receiver {
  margin-top: 12px;
  background: var(--tk-bg-tertiary);
  border: 1px solid var(--tk-border-light);
  border-radius: 10px;
  overflow: hidden;
}

.streaming-receiver__header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--tk-text-tertiary);
  padding: 8px 12px 2px;
}

.streaming-receiver__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tk-accent);
  animation: receiver-pulse 1.2s ease-in-out infinite;
}

.streaming-receiver__body {
  font-size: 13px;
  line-height: 1.4;
  color: var(--tk-text-secondary);
  padding: 6px 12px 10px;
  max-height: 67px;         /* 3 行 × 18.2px + padding ≈ 67px */
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
}

@keyframes receiver-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.15); }
}

/* ── Collapse transition（emil：指定属性 + 强 ease-out） ── */

.collapse-enter-active {
  transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1),
    max-height 240ms cubic-bezier(0.23, 1, 0.32, 1),
    margin-top 240ms cubic-bezier(0.23, 1, 0.32, 1),
    padding-top 240ms cubic-bezier(0.23, 1, 0.32, 1),
    padding-bottom 240ms cubic-bezier(0.23, 1, 0.32, 1);
}
.collapse-leave-active {
  transition: opacity 140ms cubic-bezier(0.23, 1, 0.32, 1),
    max-height 180ms cubic-bezier(0.23, 1, 0.32, 1),
    margin-top 180ms cubic-bezier(0.23, 1, 0.32, 1),
    padding-top 180ms cubic-bezier(0.23, 1, 0.32, 1),
    padding-bottom 180ms cubic-bezier(0.23, 1, 0.32, 1);
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

/* ── Timestamp（emil：hover 显示——低频率操作藏进 hover；触屏点击显示） ── */

.message-timestamp {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  line-height: 1;
  padding: 0 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  align-self: flex-end;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 160ms cubic-bezier(0.23, 1, 0.32, 1);
  pointer-events: none;
}

/* assistant 行：时间戳推到行最右（气泡在左） */
.message-row--assistant .message-timestamp {
  margin-left: auto;
}

.message-timestamp.visible {
  opacity: 1;
  pointer-events: auto;
}

@media (hover: hover) and (pointer: fine) {
  .message-row:hover .message-timestamp {
    opacity: 1;
    pointer-events: auto;
  }
}

.message-timestamp__time {
  color: var(--tk-text-tertiary);
}

.ts-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: none;
  border: none;
  padding: 0;
  border-radius: 5px;
  color: var(--tk-text-tertiary);
  cursor: pointer;
  opacity: 0.75;
  transition: opacity 160ms cubic-bezier(0.23, 1, 0.32, 1),
    color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.ts-btn:active {
  transform: scale(0.92);
}
@media (hover: hover) and (pointer: fine) {
  .ts-btn:hover {
    opacity: 1;
    color: var(--tk-accent);
    background: var(--tk-bg-selected);
  }
}

/* ── 发送状态 ── */

.message-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--tk-text-tertiary);
  padding: 0 4px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.status-dot--sending {
  background: var(--tk-accent);
  animation: pulse 1.2s ease-in-out infinite;
}

.status-dot--failed {
  background: var(--tk-destructive);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
