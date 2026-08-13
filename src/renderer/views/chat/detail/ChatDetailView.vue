<template>
  <div class="chat-detail">
    <!-- 对话数据面板（右侧按钮 → 手风琴拉出） -->
    <ChatStatsPanel />
    <!-- 移动端浮动 AgentCard -->
    <transition name="agent-slide">
      <AgentCard
        v-if="isMobile && showAgentCard"
        :agent="agent"
        :thinking-active="isThinking"
        class="chat-detail__agent-card"
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
      :switching-session="switchingSession"
      :pending-buffer="pendingBuffer"
      @send="onSendMessage"
      @load-more="onLoadMore"
      @approve="onApprove"
      @reject="onReject"
      @auto-approve="onAutoApprove"
      @deleted="onDeleted"
      @history-preview="goHistoryPreview"
    />

    <!-- 打断对话按钮（只在 queue 模式显示——redirect/interrupt 自动处理无需手动打断）+ 预览/气泡切换按钮 -->
    <ToolbarActions>
      <button
        v-if="busyMode === BUSY_MODE_QUEUE"
        class="toolbar-btn stop-btn"
        :class="{ 'stop-btn--active': isStreamingActive }"
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

    <!-- 移动端 Toolbar 中 agent 头像切换按钮（状态图标与 session item 一致——翻转切换） -->
    <ToolbarActions v-if="isMobile">
      <button
        v-if="agent"
        :class="['toolbar-btn agent-toggle-btn', { 'agent-toggle-btn--thinking': isThinking }]"
        :title="showAgentCard ? '收起 Agent 信息' : '查看 Agent 信息'"
        @click="showAgentCard = !showAgentCard"
      >
        <Transition name="icon-flip" mode="out-in">
          <!-- 等审批：黄色感叹号 -->
          <span v-if="aiStage === 'approval'" key="approval" class="agent-toggle-btn__stage agent-toggle-btn__stage--wait" title="等待审批">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="7" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
          <!-- 等回答（clarify）：问号 -->
          <span v-else-if="aiStage === 'clarify'" key="clarify" class="agent-toggle-btn__stage agent-toggle-btn__stage--wait" title="等待你的回答">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
          <!-- 工作中：圆环 spinner -->
          <span v-else-if="aiStage === 'working'" key="working" class="agent-toggle-btn__spinner" />
          <!-- 工具调用：齿轮旋转 -->
          <span v-else-if="aiStage === 'tool'" key="tool" class="agent-toggle-btn__gear" title="工具执行中">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </span>
          <!-- 空闲：agent 头像 / Ai 文字 -->
          <span v-else key="idle">
            <img
              v-if="agent.avatar"
              :src="agent.avatar"
              alt=""
              class="agent-toggle-btn__avatar"
            />
            <span v-else class="agent-toggle-btn__text">Ai</span>
          </span>
        </Transition>
      </button>
    </ToolbarActions>
  </div>
</template>

<script setup lang="ts">
import ChatStatsPanel from '@/renderer/components/workspace/ChatStatsPanel.vue'
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
import { agentConfigApi } from '@/renderer/api/agent-config-api'
import { BUSY_MODE_QUEUE } from '@/renderer/api/types'

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

/** 当前会话忙碌模式（打断按钮只在 queue 模式显示——redirect/interrupt 自动处理新消息——无需手动打断） */
const busyMode = ref(BUSY_MODE_QUEUE)
watch(
  () => [profile.value, sessionId.value],
  async () => {
    try {
      const cfg = await agentConfigApi.get(profile.value)
      busyMode.value = cfg.messageBusyMode ?? BUSY_MODE_QUEUE
    } catch {
      busyMode.value = BUSY_MODE_QUEUE
    }
  },
  { immediate: true },
)

/** 当前会话是否有流式/处理中消息（打断按钮可用状态） */
const isStreamingActive = computed(() => {
  if (isThinking.value) return true
  return !!chatStore.getMessages(sessionId.value).find(m => m.isStreaming)
})

/** AI 按钮状态（与 session item 图标一致——approval/clarify/working/tool——空闲显示头像） */
const aiStage = computed(() => chatStore.sessionStage(sessionId.value))

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
/* 切换 session 加载态（独立于加载更多——不管有无缓存都显示覆盖层） */
const switchingSession = ref(false)

watch(sessionId, (newId, oldId) => {
  if (newId && oldId && newId !== oldId) {
    // 清理旧 session 的流式 chunks（不中断后台 buffer 累积）
    chatStore.clearConvChunks(oldId, chatStore.getActiveStreamingConvId(oldId))
    sessionStore.setSessionId(newId)
    loadMessages(newId)
  }
}, { immediate: true })

async function loadMessages(sid: string) {
  switchingSession.value = true
  hasMoreMessages.value = true
  const loadStart = Date.now()
  try {
    const messages = await chatStore.loadMessagesFromApi(sid, 50, 0)
    hasMoreMessages.value = messages.length >= 50
  } catch (e) {
    console.error('Failed to load messages', e)
  } finally {
    // 加载覆盖层至少显示 250ms——防止超快加载一闪而过
    const elapsed = Date.now() - loadStart
    if (elapsed < 250) {
      await new Promise((r) => setTimeout(r, 250 - elapsed))
    }
    switchingSession.value = false
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

function onAutoApprove(toolCallId: string) {
  chatStore.resolveAutoApprove(toolCallId)
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
  position: relative;
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
  transition: max-height 250ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 200ms cubic-bezier(0.23, 1, 0.32, 1),
    padding-top 250ms cubic-bezier(0.23, 1, 0.32, 1),
    padding-bottom 250ms cubic-bezier(0.23, 1, 0.32, 1),
    margin-top 250ms cubic-bezier(0.23, 1, 0.32, 1),
    margin-bottom 250ms cubic-bezier(0.23, 1, 0.32, 1);
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

/* AI 按钮状态图标（与 session item 一致） */
.agent-toggle-btn__stage {
  display: inline-flex;
  color: #f5a623;
}

.agent-toggle-btn__spinner {
  width: 15px;
  height: 15px;
  border: 2px solid rgba(0, 122, 255, 0.25);
  border-top-color: var(--tk-accent);
  border-radius: 50%;
  animation: agent-toggle-spin 0.8s linear infinite;
}

.agent-toggle-btn__gear {
  display: inline-flex;
  color: var(--tk-accent);
  animation: agent-toggle-spin 2.4s linear infinite;
}

@keyframes agent-toggle-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 状态图标切换（垂直翻转——与 session item 一致） */
.icon-flip-enter-active,
.icon-flip-leave-active {
  transition: transform 180ms cubic-bezier(0.23, 1, 0.32, 1);
}

.icon-flip-enter-from {
  transform: rotateX(90deg);
}

.icon-flip-leave-to {
  transform: rotateX(-90deg);
}

@media (prefers-reduced-motion: reduce) {
  .icon-flip-enter-active,
  .icon-flip-leave-active {
    transition: none;
  }
}

/* ── Toolbar 切换按钮（基于 toolbar-btn 边框浮起式——WorkspaceToolbar 提供基础） ── */

.agent-toggle-btn__avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
}

.agent-toggle-btn__text {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
  line-height: 1;
  color: var(--tk-accent);
}

/* ── 打断对话按钮（toolbar-btn 基础 + 状态色覆盖） ── */

.stop-btn {
  color: var(--tk-text-secondary);
}

.stop-btn--active {
  color: var(--tk-destructive);
  border-color: rgba(255, 59, 48, 0.35);
  background: rgba(255, 59, 48, 0.06);
}

@media (hover: hover) and (pointer: fine) {
  .stop-btn--active:hover {
    background: rgba(255, 59, 48, 0.12);
  }
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
