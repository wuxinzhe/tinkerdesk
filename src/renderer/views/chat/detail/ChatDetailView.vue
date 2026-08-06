<template>
  <div class="chat-detail">
    <!-- 移动端浮动 AgentCard -->
    <transition name="agent-slide">
      <AgentCard
        v-if="isMobile && showAgentCard"
        :agent="agent"
        :thinking-active="isThinking"
        :closable="true"
        class="chat-detail__agent-card"
        @close="showAgentCard = false"
        @switch-agent="router.push('/workspace/agents')"
      />
    </transition>

    <ChatAreaComponent
      :messages="chatStore.getMessages(sessionId)"
      :streaming-content="pendingBuffer"
      :streaming-reasoning="streamingReasoning"
      :is-streaming="!!chatStore.getMessages(sessionId).find(m => m.isStreaming)"
      :session-id="sessionId"
      :profile="profile"
      :has-more="hasMoreMessages"
      :loading-more="loadingMessages"
      :pending-buffer="pendingBuffer"
      @send="onSendMessage"
      @load-more="onLoadMore"
      @approve="onApprove"
      @reject="onReject"
      @deleted="onDeleted"
      @history-preview="goHistoryPreview"
    />

    <!-- 打断对话按钮 + 预览/气泡切换按钮（横向并排，teleport 到 L3 顶栏右侧） -->
    <ToolbarActions>
      <button
        class="stop-toggle-btn"
        :class="{ 'stop-toggle-btn--active': isStreamingActive }"
        :disabled="!isStreamingActive"
        :title="isStreamingActive ? '打断对话' : '对话空闲'"
        @click="onInterrupt"
      >
        <svg width="14" height="14" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="2" />
          <rect x="8" y="8" width="8" height="8" rx="1.5" fill="currentColor" stroke="none" />
        </svg>
      </button>
    </ToolbarActions>

    <!-- 移动端 Toolbar 中 agent 头像切换按钮 -->
    <ToolbarActions v-if="isMobile">
      <button
        v-if="agent"
        :class="['agent-toggle-btn', { 'agent-toggle-btn--thinking': isThinking }]"
        :title="showAgentCard ? '收起 Agent 信息' : '查看 Agent 信息'"
        @click="showAgentCard = !showAgentCard"
      >
        <img
          v-if="agent.avatar"
          :src="agent.avatar"
          alt=""
          class="agent-toggle-btn__avatar"
        />
        <span v-else class="agent-toggle-btn__text">Ai</span>
      </button>
    </ToolbarActions>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTypewriter } from '@/renderer/utils/streaming/useTypewriter'
import ChatAreaComponent from '@/renderer/components/workspace/ChatAreaComponent.vue'
import AgentCard from '@/renderer/components/chat/AgentCard.vue'
import ToolbarActions from '@/renderer/components/workspace/ToolbarActions.vue'
import { useChatStore } from '@/renderer/stores/chat-store'
import { useSessionStore } from '@/renderer/stores/session-store'
import { useAgentStore } from '@/renderer/stores/agent-store'
import { useMobile } from '@/renderer/composables/use-mobile'
import { useSetupThinking, useThinkingState } from '@/renderer/composables/use-agent-thinking'

const route = useRoute()
const router = useRouter()
const sessionStore = useSessionStore()
const chatStore = useChatStore()
const agentStore = useAgentStore()
const isMobile = useMobile()
const sessionId = computed(() => route.params.sessionId as string)

/** 当前流式的原始 buffer（isFinish 后无 buffer → 返回 ''） */
const pendingBufferRaw = computed(() => {
  const convId = chatStore.getActiveStreamingConvId(sessionId.value)
  return convId ? chatStore.getConvPendingBuffer(sessionId.value, convId) : ''
})

/** 打字机平滑：LLM 推流不均匀（150~900ms/包）时实时区（接收区/思考气泡）仍连续流动 */
const { displayed: pendingBuffer, fastForward: ffPending } = useTypewriter(pendingBufferRaw)
const { displayed: streamingReasoning, fastForward: ffReasoning } = useTypewriter(
  computed(() => chatStore.getStreamingReasoning(sessionId.value))
)

/** 流式结束（isStreaming=false）→ 快进到完整内容（避免平滑器落后导致最后一段缺失） */
const isStreamingNow = computed(() => !!chatStore.getMessages(sessionId.value).find(m => m.isStreaming))
watch(isStreamingNow, (v) => {
  if (!v) {
    ffPending()
    ffReasoning()
  }
})

/* ── Agent 信息 ── */
const profile = computed(() => sessionStore.profile)
watch(profile, (p) => { agentStore.loadCurrentAgent(p || '') }, { immediate: true })
const agent = computed(() => agentStore.currentAgent)

/* ── Thinking 状态（共享） ── */
useSetupThinking()
const { isThinking } = useThinkingState()

/** 当前会话是否有流式/处理中消息（打断按钮可用状态） */
const isStreamingActive = computed(() => {
  if (isThinking.value) return true
  return !!chatStore.getMessages(sessionId.value).find(m => m.isStreaming)
})

/** 打断对话：发送 stop 并清理本地流式状态 */
function onInterrupt() {
  if (!sessionId.value) return
  chatStore.stopProcessing(sessionId.value)
}

/** 打开历史预览：入栈新页面（独立路由），顶部标题由 WorkspaceView 识别 /history */
function goHistoryPreview() {
  if (!sessionId.value) return
  router.push({ path: `/workspace/chat/${sessionId.value}/history` })
}

const showAgentCard = ref(false)
/* ── Message loading ── */
const loadingMessages = ref(false)
const hasMoreMessages = ref(true)

watch(sessionId, (newId, oldId) => {
  if (newId && oldId && newId !== oldId) {
    // 清理旧 session 的流式 chunks（不中断后台 buffer 累积）
    chatStore.clearConvChunks(oldId, chatStore.getActiveStreamingConvId(oldId))
    sessionStore.setSessionId(newId)
    loadMessages(newId)
  }
}, { immediate: true })

async function loadMessages(sid: string) {
  loadingMessages.value = true
  hasMoreMessages.value = true
  try {
    const messages = await chatStore.loadMessagesFromApi(sid, 50, 0)
    hasMoreMessages.value = messages.length >= 50
  } catch (e) {
    console.error('Failed to load messages', e)
  } finally {
    loadingMessages.value = false
  }
}

async function onLoadMore() {
  if (!sessionId.value || loadingMessages.value) return
  loadingMessages.value = true
  try {
    const older = await chatStore.loadOlderMessages(sessionId.value, 50)
    hasMoreMessages.value = older.length >= 50
  } catch (e) {
    console.error('Failed to load more messages', e)
  } finally {
    loadingMessages.value = false
  }
}

function onSendMessage(text: string) {
  if (!sessionId.value) return
  chatStore.sendMessage(sessionId.value, text)
}

function onApprove(toolCallId: string) {
  chatStore.resolveApproval(toolCallId, true)
}

function onReject(toolCallId: string) {
  chatStore.resolveApproval(toolCallId, false)
}

function onDeleted() {
  if (isMobile.value) {
    router.replace('/workspace/chat')
  } else {
    router.back()
  }
}

onMounted(() => {
  if (sessionId.value) {
    sessionStore.setSessionId(sessionId.value)
    loadMessages(sessionId.value)
  }
})

onUnmounted(() => {
  sessionStore.setSessionId(null)
})
</script>

<style scoped>
.chat-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
}

.chat-detail > :last-child {
  flex: 1;
  min-height: 0;
}

/* ── 移动端浮动 AgentCard ── */

.chat-detail__agent-card {
  margin: 0;
  border-radius: 0;
  border-left: none;
  border-right: none;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  z-index: 5;
}

.agent-slide-enter-active,
.agent-slide-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.agent-slide-enter-from,
.agent-slide-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  margin-bottom: 0;
}

.agent-slide-enter-to,
.agent-slide-leave-from {
  max-height: 200px;
  opacity: 1;
}

/* ── Toolbar 切换按钮 ── */

.agent-toggle-btn {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--sa-text-secondary, #86868b);
  transition: background 0.12s;
  line-height: 0;
  padding: 0;
}

.agent-toggle-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.agent-toggle-btn__avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
}

.agent-toggle-btn__text {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
  line-height: 1;
  color: var(--sa-accent, #007aff);
}

/* ── 打断对话按钮 ── */

.stop-toggle-btn {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--sa-text-secondary, #86868b);
  transition: background 0.12s;
  line-height: 0;
  padding: 0;
}

.stop-toggle-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.06);
}

.stop-toggle-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.stop-toggle-btn--active {
  color: #ff3b30;
}

.stop-toggle-btn--active:hover:not(:disabled) {
  background: color-mix(in srgb, #ff3b30 10%, transparent);
}

/* ── Thinking 态：呼吸动效 ── */
.agent-toggle-btn--thinking {
  animation: agent-btn-think-pulse 1.6s ease-in-out infinite;
}

@keyframes agent-btn-think-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(0, 122, 255, 0.3);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(0, 122, 255, 0);
    transform: scale(1.08);
  }
}
</style>
