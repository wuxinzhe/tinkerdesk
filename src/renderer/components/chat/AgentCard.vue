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
          </div>
          <div v-if="agent.description" class="agent-card__model" :title="agent.description">
            {{ agent.description }}
          </div>
          <div v-else class="agent-card__model">
            {{ agent.agentModeId || 'default' }}<template v-if="agent.agentModeVersion">
              · {{ agent.agentModeVersion }}
            </template>
          </div>
        </div>
      </div>
      <!-- 默认角标（卡片内部右上角） -->
      <span v-if="agent.isDefault" class="agent-card__corner-badge" title="默认 Agent">默认</span>
      <!-- 分割线（常显——折叠时也在） -->
      <div class="agent-card__memory-divider"></div>
      <!-- 记忆占用（芯片默认隐藏——记忆按钮展开；点击芯片跳转记忆管理页） -->
      <div class="agent-card__memory-wrap" :class="{ 'agent-card__memory-wrap--open': memoryOpen }">
        <div class="agent-card__chips">
          <div class="agent-card__chip" :title="`Memory 记忆（${(agent.memoryChars ?? 0) / 1024 > 1 ? '查看' : '管理'}）——点击查看记忆内容`" @click="goMemory('memory')">
            <span class="agent-card__chip-tag">Memory</span>
            <span class="agent-card__chip-num">{{ formatChars(agent.memoryChars) }} / {{ formatChars(agent.memoryMaxChars) }}</span>
          </div>
          <div class="agent-card__chip" title="User 用户画像记忆——点击查看记忆内容" @click="goMemory('user')">
            <span class="agent-card__chip-tag">User</span>
            <span class="agent-card__chip-num">{{ formatChars(agent.userChars) }} / {{ formatChars(agent.userMaxChars) }}</span>
          </div>
        </div>
      </div>

      <div class="agent-card__footer">
        <div class="agent-card__footer-top">
          <span v-if="agent.mainModelName" class="agent-card__model-name">{{ agent.mainModelName }}</span>
          <div class="agent-card__actions">
            <!-- 常显（主操作）：切换 Agent + 记忆 -->
            <button class="agent-card__btn" title="切换 Agent" @click="$emit('switch-agent')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 1l4 4-4 4" />
                <path d="M3 11V9a4 4 0 014-4h14" />
                <path d="M7 23l-4-4 4-4" />
                <path d="M21 13v2a4 4 0 01-4 4H3" />
              </svg>
            </button>
            <button class="agent-card__manage-btn" title="记忆" :class="{ 'agent-card__btn--active': memoryOpen }" @click="toggleMemory">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="5" y="5" width="14" height="14" rx="2" />
                <line x1="9" y1="5" x2="9" y2="2" /><line x1="15" y1="5" x2="15" y2="2" />
                <line x1="9" y1="19" x2="9" y2="22" /><line x1="15" y1="19" x2="15" y2="22" />
              </svg>
            </button>
            <!-- hover 浮现组（桌面悬停显示；触屏常显）：技能/工具/提示词/设置 -->
            <div class="agent-card__manage-group">
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
            </div>
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
            <div class="thought-area__text">
              {{ currentThought }}
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/renderer/stores/session-store'
import { useChatStore } from '@/renderer/stores/chat-store'

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

/** 记忆体积显示（单位：字符——与 hermes memory 一致；非 KB） */
function formatChars(chars: number | undefined): string {
  if (chars === undefined) return '—'
  return chars.toLocaleString()
}


const props = defineProps<{
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

// ── 记忆芯片折叠（默认收起——记忆按钮展开/收起） ──
const memoryOpen = ref(false)
function toggleMemory() {
  memoryOpen.value = !memoryOpen.value
}

/** 点击芯片跳转记忆管理页（MemoryManageView——CRUD + 拖拽排序） */
function goMemory(target: string) {
  if (!props.agent?.profile) return
  router.push(`/workspace/agents/${props.agent.profile}/memory?target=${target}`)
}

// 内容追加时自动滚动到底部（固定高度内滚动）
watch(currentThought, () => {
  const el = thoughtBodyRef.value
  if (el) el.scrollTop = el.scrollHeight
})

// ── 思考气泡 = chat-store 直读（streamingReasoningBySession 累积值——不再走 window 事件） ──
const chatStore = useChatStore()
const currentReasoning = computed(() =>
  sessionStore.sessionId ? chatStore.getStreamingReasoning(sessionStore.sessionId) : ''
)

watch(currentReasoning, (v) => {
  // store 累积变化 → 刷新气泡内容（纯推理流每 chunk 触发——天然 append）
  if (v) {
    currentThought.value = v
    thoughtActive.value = true
  }
})

function handleConversationComplete() {
  // 只有收到 conversation-complete 才隐藏思考气泡
  thoughtActive.value = false
  currentThought.value = ''
}

onMounted(() => {
  window.addEventListener('conversation-complete', handleConversationComplete)
})

onUnmounted(() => {
  window.removeEventListener('conversation-complete', handleConversationComplete)
})
</script>

<style scoped>
.agent-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 12px 0;
  padding: 12px 14px 10px;
  border-radius: 14px;
  background: var(--tk-bg-primary);
  border: 1px solid var(--tk-border-card);
  box-shadow: var(--tk-shadow-card);
  cursor: default;
  user-select: none;
}

/* 默认角标（卡片内部右上角——对齐卡片内边距，不溢出） */
.agent-card__corner-badge {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 9px;
  font-weight: 600;
  color: #fff;
  background: var(--tk-accent);
  border-radius: 4px;
  padding: 1px 6px;
  line-height: 1.4;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  z-index: 1;
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
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--tk-accent);
  color: #fff;
  overflow: hidden;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.08);
}

.agent-card--thinking .agent-card__avatar {
  /* 呼吸动效已迁移到 Ai 按钮 */
}

.agent-card__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 12px;
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
  color: var(--tk-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

/* profile（名字右侧括号） */
.agent-card__profile {
  font-size: 11px;
  font-weight: 400;
  color: var(--tk-text-tertiary);
  flex-shrink: 0;
}

/* 默认角标（右上角） */
/* 默认角标已迁移为 .agent-card__corner-badge（右上角）——旧类保留仅为过渡（模板已不引用） */

.agent-card__model {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}

/* ── 记忆芯片（分割线常显；芯片默认隐藏——展开时高度动画） ── */
.agent-card__memory-divider {
  border-top: 1px solid var(--tk-border);
  margin-top: 8px;
}

.agent-card__memory-wrap {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.28s ease;
}

.agent-card__memory-wrap--open {
  max-height: 140px;
}

/* 记忆按钮 active 态（展开时高亮） */
.agent-card__btn--active {
  background: var(--tk-accent);
  color: #fff;
}

/* ── 记忆占用：双芯片（浅色 IC 芯片风格——金属引脚 + tag/用量/容量） ── */
.agent-card__chips {
  display: flex;
  flex-direction: row;
  justify-content: space-evenly;
  padding: 10px 2px 2px;
}

/* 芯片主体（正方形——硅片质感 + 方向圆点 + 左右金色引脚） */
.agent-card__chip {
  flex: 0 0 auto;
  width: 72px;
  height: 72px;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.12s, box-shadow 0.12s;
  /* 方向圆点（左上角——IC 引脚 1 标记）+ 硅片浅色渐变 */
  background:
    radial-gradient(circle at 12px 12px, #d4a92e 1.6px, transparent 2.4px),
    linear-gradient(145deg, #fbfcfd, #e7eaf0);
  border: 1px solid #c6cbd4;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.95),
    0 1px 3px rgba(0, 0, 0, 0.08);
}

.agent-card__chip:hover {
  transform: translateY(-1px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.95),
    0 2px 6px rgba(0, 0, 0, 0.12);
  border-color: var(--tk-accent);
}

/* 左侧引脚（金色——四小段竖条） */
.agent-card__chip::before {
  content: '';
  position: absolute;
  left: -7px;
  top: 8px;
  width: 5px;
  height: 5px;
  background: linear-gradient(#f2dc9c, #b8963f);
  border-radius: 1px 0 0 1px;
  box-shadow:
    0 11px 0 -1px #c9a227,
    0 22px 0 -1px #c9a227,
    0 33px 0 -1px #c9a227,
    0 44px 0 -1px #c9a227;
}

/* 右侧引脚 */
.agent-card__chip::after {
  content: '';
  position: absolute;
  right: -7px;
  top: 8px;
  width: 5px;
  height: 5px;
  background: linear-gradient(#f2dc9c, #b8963f);
  border-radius: 0 1px 1px 0;
  box-shadow:
    0 11px 0 -1px #c9a227,
    0 22px 0 -1px #c9a227,
    0 33px 0 -1px #c9a227,
    0 44px 0 -1px #c9a227;
}

/* 芯片标签（硅片丝印蚀刻文字——深色凹刻感，无背景块，居中） */
.agent-card__chip-tag {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: #3a3d42;
  line-height: 1.4;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.95);
}

/* Memory/User 蚀刻色相微调（绿/蓝——丝印感） */
.agent-card__chip:nth-child(1) .agent-card__chip-tag {
  color: #2f6d3c;
}

.agent-card__chip:nth-child(2) .agent-card__chip-tag {
  color: #1a5da6;
}

/* 用量/容量（蚀刻数字——同硅片丝印，居中；正方形内允许换行） */
.agent-card__chip-num {
  font-size: 9px;
  font-weight: 600;
  color: #6a6e76;
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: normal;
  line-height: 1.3;
  max-width: 100%;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.9);
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

/* 管理入口组（常驻显示——用户确认不隐藏：隐藏显得空/怪） */
.agent-card__manage-group {
  display: flex;
  gap: 4px;
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

/* 管理入口（技能/工具/提示词/设置——对齐 AgentListView action 按钮） */
.agent-card__manage-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--tk-text-tertiary);
  cursor: pointer;
  padding: 0;
  transition: background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 150ms cubic-bezier(0.23, 1, 0.32, 1);
}
.agent-card__manage-btn:active {
  transform: scale(0.93);
}
@media (hover: hover) and (pointer: fine) {
  .agent-card__manage-btn:hover {
    background: var(--tk-bg-secondary);
    color: var(--tk-accent);
  }
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
    var(--tk-border) 0%,
    var(--tk-accent) 50%,
    var(--tk-border) 100%
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
  color: var(--tk-accent);
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
  color: var(--tk-text-tertiary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.agent-card__btn:hover {
  background: var(--tk-accent);
  color: #fff;
}

.agent-card__desc {
  font-size: 11px;
  color: var(--tk-text-secondary);
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
  background: var(--tk-bg-secondary);
  border: 1px solid var(--tk-border);
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
  background: var(--tk-accent);
  animation: thought-pulse 1.4s ease-in-out infinite;
}

@keyframes thought-pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.15); }
}

.thought-area__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--tk-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.thought-area__body {
  height: 86px;             /* 固定高度：4 行 × 19.2px + 上下留白 ≈ 86px */
  overflow: hidden;         /* 思考气泡：隐藏滚动条且不允许滚动 */
}


.thought-area__text {
  font-size: 12px;
  line-height: 1.6;
  color: var(--tk-text-secondary);
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
