<template>
  <div v-if="agent" :class="['agent-card', { 'agent-card--thinking': thinkingActive }]">
    <div class="agent-card__head">
      <div class="agent-card__body">
        <div class="agent-card__avatar">
          <img v-if="agent.avatar" :src="agent.avatar" alt="" class="agent-card__avatar-img" />
          <img v-else src="/default_avatar.png" alt="" class="agent-card__avatar-img" />
        </div>
        <div class="agent-card__info">
          <div class="agent-card__name">
            {{ agent.displayName || '默认 Agent' }}
            <span class="agent-card__profile">({{ agent.profile }})</span>
            <span v-if="agent.isDefault" class="agent-card__badge" title="默认 Agent">默认</span>
          </div>
          <div v-if="agent.description" class="agent-card__model" :title="agent.description">{{ agent.description }}</div>
          <div v-else class="agent-card__model">{{ agent.agentModeId || 'default' }}<template v-if="agent.agentModeVersion"> · {{ agent.agentModeVersion }}</template></div>
        </div>
      </div>
      <!-- 记忆占用（profile 级——与 AgentInfo 一起返回；位于按钮上方） -->
      <div class="agent-card__memory">
        <div class="agent-card__memory-item">
          <div class="agent-card__memory-row">
            <span class="agent-card__memory-tag">Memory</span>
            <span class="agent-card__memory-num">{{ formatKB(agent.memoryChars) }} / {{ formatKB(agent.memoryMaxChars) }}</span>
          </div>
          <div class="agent-card__memory-bar"><div class="agent-card__memory-fill agent-card__memory-fill--mem" :style="{ width: formatPercent(agent.memoryPercent) }"></div></div>
        </div>
        <div class="agent-card__memory-item">
          <div class="agent-card__memory-row">
            <span class="agent-card__memory-tag">User</span>
            <span class="agent-card__memory-num">{{ formatKB(agent.userChars) }} / {{ formatKB(agent.userMaxChars) }}</span>
          </div>
          <div class="agent-card__memory-bar"><div class="agent-card__memory-fill agent-card__memory-fill--usr" :style="{ width: formatPercent(agent.userPercent) }"></div></div>
        </div>
      </div>

      <div class="agent-card__footer">
        <div class="agent-card__footer-top">
          <span v-if="agent.mainModelName" class="agent-card__model-name">{{ agent.mainModelName }}</span>
          <div class="agent-card__actions">
            <button class="agent-card__btn" title="切换 Agent" @click="$emit('switch-agent')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 1l4 4-4 4" />
                <path d="M3 11V9a4 4 0 014-4h14" />
                <path d="M7 23l-4-4 4-4" />
                <path d="M21 13v2a4 4 0 01-4 4H3" />
              </svg>
            </button>
            <!-- 管理入口（技能/工具/提示词/设置/编辑——排在切换按钮后，整排靠右） -->
            <button class="agent-card__manage-btn" title="技能" @click="goSkills">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </button>
            <button class="agent-card__manage-btn" title="工具" @click="goTools">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
              </svg>
            </button>
            <button class="agent-card__manage-btn" title="提示词" @click="goPromptModules">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="13" y2="17" />
              </svg>
            </button>
            <button class="agent-card__manage-btn" title="设置" @click="goSettings">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
            <button class="agent-card__manage-btn" title="编辑" @click="goEdit">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 思考卡片 -->
    <!-- key 稳定：流式追加时 DOM 原地更新，不重建、不重放动画 -->
    <transition name="thought-expand">
      <div v-if="thoughtActive" class="thought-area">
        <div class="thought-area__inner">
          <div class="thought-area__header">
            <span class="thought-area__indicator" />
            <span class="thought-area__label">思考中</span>
          </div>
          <div ref="thoughtBodyRef" class="thought-area__body">
            <div class="thought-area__text">{{ currentThought }}</div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/renderer/stores/session-store'

const router = useRouter()
const sessionStore = useSessionStore()

/** 管理入口跳转（对齐 AgentListView：/workspace/agents/:profile/<功能>） */
function goManage(subPath: string): void {
  const profile = sessionStore.profile
  if (!profile) return
  router.push(`/workspace/agents/${profile}/${subPath}`)
}
const goSkills = () => goManage('skills')
const goTools = () => goManage('tools')
const goPromptModules = () => goManage('prompt-modules')
const goSettings = () => goManage('settings')
const goEdit = () => goManage('edit')

/** 组件私有 Agent 展示类型（完整 Agent 定义在 api/types.ts） */
interface AgentInfo {
  displayName?: string
  description?: string
  avatar?: string
  soulPrompt?: string
  agentModeId?: string
  agentModeVersion?: string
  isDefault?: boolean
  profile?: string
  /** 对话场景主力模型名 */
  mainModelName?: string
  /** 记忆占用（profile 级——与 AgentInfo 一起返回） */
  memoryChars?: number
  memoryMaxChars?: number
  memoryPercent?: number
  userChars?: number
  userMaxChars?: number
  userPercent?: number
}

/** 记忆体积统一 KB */
function formatKB(chars: number | undefined): string {
  if (chars === undefined) return '—'
  return `${Math.round((chars / 1024) * 10) / 10}KB`
}

function formatPercent(v: number | undefined): string {
  if (v === undefined || Number.isNaN(v)) return '0%'
  return `${Math.round(v * 100)}%`
}

defineProps<{
  agent: AgentInfo | null
  thinkingActive: boolean
}>()

defineEmits<{
  'switch-agent': []
}>()

/* ── 思考动画状态机 ── */
//
// 时序：出场动画 1.5s → 停留 3s → 退场动画 1.5s
// 流式 reasoning token 到来时持续追加文本

const thoughtActive = ref(false)
const currentThought = ref('')
const thoughtBodyRef = ref<HTMLElement | null>(null)
let reasoningAccum = '' // 累积流式内容

function showThought(text: string) {
  currentThought.value = text
  thoughtActive.value = true
}

// 内容追加时自动滚动到底部（固定高度内滚动）
watch(currentThought, () => {
  const el = thoughtBodyRef.value
  if (el) el.scrollTop = el.scrollHeight
})

/**
 * 处理流式 reasoning token：持续追加到思考气泡（不自动隐藏——只有 conversation complete 才隐藏）
 */
function handleReasoningToken(e: Event) {
  const { reasoning } = (e as CustomEvent).detail ?? {}
  if (!reasoning) return
  reasoningAccum += reasoning
  showThought(reasoningAccum)
}

/**
 * 新一轮推理开始（isNewStream：新文本/工具轮次到来）→ 清理上一轮 reasoning，只留本轮
 */
function handleReasoningStart() {
  reasoningAccum = ''
}

function handleConversationComplete(e: Event) {
  // 只有收到 conversation-complete 才隐藏思考气泡
  thoughtActive.value = false
  reasoningAccum = ''
}

onMounted(() => {
  window.addEventListener('agent-reasoning-token', handleReasoningToken)
  window.addEventListener('agent-reasoning-start', handleReasoningStart)
  window.addEventListener('conversation-complete', handleConversationComplete)
})

onUnmounted(() => {
  window.removeEventListener('agent-reasoning-token', handleReasoningToken)
  window.removeEventListener('agent-reasoning-start', handleReasoningStart)
  window.removeEventListener('conversation-complete', handleConversationComplete)
})
</script>

<style scoped>
.agent-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 12px 0;
  padding: 10px 12px 8px;
  border-radius: 10px;
  background: var(--sa-bg-secondary, #f5f5f7);
  border: 1px solid var(--sa-border, #d2d2d7);
  cursor: default;
  user-select: none;
}

.agent-card--thinking {
  /* 去掉蓝色边框，保留头像呼吸 */
}

.agent-card__head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-card__body {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.agent-card__avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--sa-accent, #007aff);
  color: #fff;
  overflow: hidden;
}

.agent-card--thinking .agent-card__avatar {
  /* 呼吸动效已迁移到 Ai 按钮 */
}

.agent-card__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}

.agent-card__info {
  flex: 1;
  min-width: 0;
}

.agent-card__name {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

/* profile（名字右侧括号） */
.agent-card__profile {
  font-size: 11px;
  font-weight: 400;
  color: var(--sa-text-tertiary, #aeaeb2);
  flex-shrink: 0;
}

/* 默认角标（右上角） */
.agent-card__badge {
  font-size: 9px;
  font-weight: 600;
  color: #fff;
  background: var(--sa-accent, #007aff);
  border-radius: 4px;
  padding: 1px 5px;
  flex-shrink: 0;
  line-height: 1.4;
}

.agent-card__model {
  font-size: 11px;
  color: var(--sa-text-tertiary, #aeaeb2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}

/* ── 记忆占用（按钮下方） ── */
.agent-card__memory {
  border-top: 1px solid var(--sa-border, #d2d2d7);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agent-card__memory-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 3px;
}

.agent-card__memory-tag {
  font-size: 10px;
  font-weight: 600;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.agent-card__memory-num {
  font-size: 10px;
  color: var(--sa-text-secondary, #86868b);
  font-variant-numeric: tabular-nums;
}

.agent-card__memory-bar {
  height: 4px;
  border-radius: 2px;
  background: var(--sa-bg-elevated, #ffffff);
  border: 1px solid var(--sa-border-light, #e8e8ed);
  box-sizing: border-box;
  overflow: hidden;
}

.agent-card__memory-fill {
  height: 100%;
  border-radius: 1px;
  transition: width 0.3s;
}

.agent-card__memory-fill--mem {
  background: #34c759;
}

.agent-card__memory-fill--usr {
  background: var(--sa-accent, #007aff);
}

/* ── 连接状态指示器 ── */

.agent-card__status {
  flex-shrink: 0;
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  margin-top: 3px;
}

.agent-card__status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  transition: background 0.3s, box-shadow 0.3s;
}

/* connected: 绿色常亮 */
.agent-card__status--connected .agent-card__status-dot {
  background: #30d158;
  box-shadow: 0 0 4px rgba(48, 209, 88, 0.5);
}

/* connecting: 黄色呼吸动画 */
.agent-card__status--connecting .agent-card__status-dot {
  background: #ff9f0a;
  animation: status-pulse 1.2s ease-in-out infinite;
}

/* disconnected: 灰色 */
.agent-card__status--disconnected .agent-card__status-dot {
  background: #8e8e93;
}

@keyframes status-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.15); }
}

.agent-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-left: auto; /* 无模型名时（footer-top 单子项）也保持靠右 */
}

.agent-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 4px;
  min-height: 26px;
  position: relative;
  overflow: hidden;
}

.agent-card__footer-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

/* 管理入口（技能/工具/提示词/设置/编辑——对齐 AgentListView action 按钮） */
.agent-card__manage-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--sa-text-tertiary, #aeaeb2);
  cursor: pointer;
  padding: 0;
  transition: background 0.15s, color 0.15s;
}

.agent-card__manage-btn:hover {
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-accent, #007aff);
}

/* ── Thinking 态：分割线蓝色流光 ── */
.agent-card--thinking .agent-card__footer {
  border-top-color: transparent;
}

.agent-card--thinking .agent-card__footer::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(
    90deg,
    var(--sa-border, #d2d2d7) 0%,
    var(--sa-accent, #007aff) 50%,
    var(--sa-border, #d2d2d7) 100%
  );
  background-size: 200% 100%;
  animation: agent-footer-glow 2s ease-in-out infinite;
}

@keyframes agent-footer-glow {
  0%   { background-position-x: 0%; }
  50%  { background-position-x: 100%; }
  100% { background-position-x: 0%; }
}

.agent-card__model-name {
  font-size: 11px;
  color: var(--sa-accent, #007aff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
  padding-right: 8px;
}

.agent-card__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--sa-text-tertiary, #aeaeb2);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.agent-card__btn:hover {
  background: var(--sa-accent, #007aff);
  color: #fff;
}

.agent-card__desc {
  font-size: 11px;
  color: var(--sa-text-secondary, #86868b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
  line-height: 1.3;
}

/* ── 思考卡片 ── */

.thought-area {
  overflow: hidden;
}

.thought-area__inner {
  padding: 10px 12px;
  background: var(--sa-bg-secondary, #f5f5f7);
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 10px;
}

.thought-area__header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.thought-area__indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sa-accent, #007aff);
  animation: thought-pulse 1.4s ease-in-out infinite;
}

@keyframes thought-pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.15); }
}

.thought-area__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--sa-text-tertiary, #aeaeb2);
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.thought-area__body {
  max-height: 67px;         /* 3 行 × 19.2px + 上下留白 ≈ 67px，与流式接收区一致 */
  overflow: hidden;         /* 思考气泡：隐藏滚动条且不允许滚动 */
}


.thought-area__text {
  font-size: 12px;
  line-height: 1.6;
  color: var(--sa-text-secondary, #86868b);
  white-space: pre-wrap;
  word-break: break-word;
}

.thought-expand-enter-active {
  transition: max-height 1.5s ease, opacity 1.5s ease;
  overflow: hidden;
}

.thought-expand-leave-active {
  transition: max-height 1.5s ease-in, opacity 1.5s ease-in;
  overflow: hidden;
}

.thought-expand-enter-from,
.thought-expand-leave-to {
  max-height: 0;
  opacity: 0;
}

.thought-expand-enter-to,
.thought-expand-leave-from {
  max-height: 160px;
  opacity: 1;
}
</style>
