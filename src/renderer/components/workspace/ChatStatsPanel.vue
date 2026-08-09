<template>
  <!-- 对话数据面板：动画在父容器（wrap 带动抽屉滑出——子容器无动画，杜绝不同步） -->
  <div class="stats" :class="{ 'stats--open': open }">
    <!-- 动画容器（transform 过渡——带动整个抽屉；阴影/圆角都在这里） -->
    <div class="stats__wrap">
      <!-- 抽屉主体（无动画——跟随父容器运动） -->
      <div class="stats__drawer">
        <div class="stats__head">
          <span>对话数据</span>
          <span class="stats__model">{{ stats.model || '—' }}</span>
        </div>

        <!-- 上下文占用（顶部模块：三层进度条 + 阈值游标） -->
        <div class="ctx-block">
          <div class="ctx-block__row">
            <span class="ctx-block__label">上下文占用</span>
            <span class="ctx-block__value">
              {{ formatTokens(stats.currentContextTokens ?? stats.promptTokens) }} / {{ formatTokens(stats.contextLimit) }}
            </span>
          </div>
          <!-- 三层：底层=窗口总量 / 中层=压缩阈值 / 上层=当前占用 -->
          <div class="ctx-block__track">
            <div class="ctx-block__layer ctx-block__layer--limit"></div>
            <div class="ctx-block__layer ctx-block__layer--threshold" :style="{ width: formatPercent(stats.thresholdPercent) }"></div>
            <div class="ctx-block__layer ctx-block__layer--used" :style="{ width: formatPercent(stats.contextUsedPercent) }"></div>
            <!-- 压缩阈值游标已移除（只读展示不再需要） -->
          </div>
          <div class="ctx-block__legend">
            <span><i class="dot dot--used"></i>已用 {{ formatPercent(stats.contextUsedPercent) }}</span>
            <span><i class="dot dot--threshold"></i>压缩阈值 {{ formatPercent(stats.thresholdPercent) }}</span>
          </div>
        </div>

        <!-- 上下文使用（顶部模块已展示——此小项删除避免重复） -->

        <!-- 会话数据（本 session 累计——两栏：标题上/数值下） -->
        <div v-if="avgLoaded" class="sess-block">
          <div class="sess-block__title">
            会话数据
          </div>
          <div class="sess-block__grid">
            <div class="sess-block__cell">
              <span class="sess-block__label">累计 tokens</span>
              <span class="sess-block__num">{{ formatTokens(avg.totalTokens) }}</span>
            </div>
            <div class="sess-block__cell">
              <span class="sess-block__label">轮次</span>
              <span class="sess-block__num">{{ avg.rounds ?? 0 }}</span>
            </div>
            <div class="sess-block__cell">
              <span class="sess-block__label">请求次数</span>
              <span class="sess-block__num">{{ avg.llmRequests ?? 0 }}</span>
            </div>
            <div class="sess-block__cell">
              <span class="sess-block__label">执行时长</span>
              <span class="sess-block__num">{{ formatDuration(avg.durationMs) }}</span>
            </div>
            <div class="sess-block__cell sess-block__cell--wide">
              <span class="sess-block__label">平均命中</span>
              <span
                class="sess-block__num sess-block__num--hit"
                :class="{
                  'sess-block__num--high': (avg.hitRate ?? 0) >= 0.5,
                  'sess-block__num--mid': (avg.hitRate ?? 0) >= 0.2 && (avg.hitRate ?? 0) < 0.5,
                }"
              >{{ formatPercent(avg.hitRate) }}</span>
            </div>
          </div>
        </div>

        <!-- 空态 -->
        <div v-if="!hasData" class="stats__empty">
          发一条消息后显示本轮数据
        </div>
      </div>
    </div>

    <!-- 切换按钮（独立于动画容器——right 切换定位；关闭贴右缘 / 打开贴抽屉左缘） -->
    <button class="stats__toggle" title="对话数据" @click="toggleOpen">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        :class="{ 'stats__chevron--open': open }"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'

interface StatsData {
  model?: string
  promptTokens?: number
  completionTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  hitRate?: number
  contextLimit?: number
  contextUsedPercent?: number
  compactedPercent?: number
  /** dashboard 冗余：当前上下文总量 + 压缩阈值（只读游标） */
  currentContextTokens?: number
  thresholdPercent?: number
}

interface AvgData {
  hitRate?: number
  promptTokens?: number
  totalTokens?: number
  durationMs?: number
  iterations?: number
  llmRequests?: number
  rounds?: number
  memoryChars?: number
  memoryEntries?: number
  memoryMaxChars?: number
  memoryPercent?: number
  userChars?: number
  userEntries?: number
  userMaxChars?: number
  userPercent?: number
}

const open = ref(false)
const stats = ref<StatsData>({})
const avg = ref<AvgData>({})

/** 展开/收起——展开时加载最新数据（dashboard 点开即拉接口最新） */
function toggleOpen() {
  open.value = !open.value
  if (open.value) void loadAvg()
}
const avgLoaded = ref(false)
const route = useRoute()
const currentSessionId = ref<string>('')

const hasData = computed(() => Object.keys(stats.value).length > 0)

function formatPercent(v: number | undefined): string {
  if (v === undefined || Number.isNaN(v)) return '—'
  return `${Math.round(v * 100)}%`
}

function formatTokens(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return '—'
  if (n >= 1000000) return `${Math.round(n / 1000000)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return String(n)
}

/** 记忆体积统一 KB（当前值/总量都是 KB） */
function formatDuration(ms: number | undefined): string {
  if (ms === undefined || Number.isNaN(ms)) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}m${sec % 60}s`
}

/** 每轮 stats 事件 → 更新当前轮数据（两个通道：stats_update 实时 + conversation_complete 带数据） */
function handleStatsUpdate(e: Event): void {
  const detail = (e as CustomEvent).detail
  if (detail?.sessionId) currentSessionId.value = detail.sessionId
  if (detail?.data) {
    stats.value = { ...stats.value, ...detail.data }
  }
  // 事件后异步拉会话平均值 + memory（IPC）
  void loadAvg()
}

/** conversation-complete 也带本轮统计——两个数据源同时消费 */
function handleConversationComplete(e: Event): void {
  const detail = (e as CustomEvent).detail
  if (detail?.sessionId) currentSessionId.value = detail.sessionId
  if (detail?.data) {
    stats.value = { ...stats.value, ...detail.data }
  }
  void loadAvg()
}

/** 拉 dashboard 整合数据（上下文窗口/阈值/统计/memory——只读） */
async function loadAvg(): Promise<void> {
  const sessionId = currentSessionId.value || String(route.params.sessionId ?? '')
  if (!sessionId) return
  try {
    const profile = String(route.params.profile ?? 'default')
    const res = await window.api.sessions.dashboard(profile, sessionId)
    if (res) {
      avg.value = {
        hitRate: res.hitRate,
        promptTokens: res.promptTokens,
        totalTokens: res.totalTokens,
        durationMs: res.durationMs,
        iterations: res.iterations,
        llmRequests: res.llmRequests,
        rounds: res.rounds,
        memoryChars: res.memoryChars,
        memoryMaxChars: res.memoryMaxChars,
        memoryPercent: res.memoryPercent,
        memoryEntries: res.memoryEntries,
        userChars: res.userChars,
        userMaxChars: res.userMaxChars,
        userPercent: res.userPercent,
        userEntries: res.userEntries,
      }
      avgLoaded.value = true
      // 上下文窗口数据（dashboard 为准——覆盖事件里的 promptTokens/contextLimit）
      stats.value = {
        ...stats.value,
        model: res.model || stats.value.model,
        contextLimit: res.contextLimit,
        currentContextTokens: res.currentContextTokens,
        contextUsedPercent: res.contextUsedPercent,
        thresholdPercent: res.thresholdPercent,
      }
    }
  } catch {
    // IPC 未就绪时静默（面板核心数据来自事件）
  }
}

onMounted(() => {
  window.addEventListener('agent-stats-update', handleStatsUpdate)
  window.addEventListener('conversation-complete', handleConversationComplete)
  void loadAvg()
})

// 切换 session：抽屉自动收回 + 数据重新拉取（面板数据围绕 session）
watch(
  () => route.params.sessionId,
  () => {
    open.value = false
    currentSessionId.value = ''
    stats.value = {}
    avg.value = {}
    avgLoaded.value = false
    void loadAvg()
  }
)

onBeforeUnmount(() => {
  window.removeEventListener('agent-stats-update', handleStatsUpdate)
  window.removeEventListener('conversation-complete', handleConversationComplete)
})
</script>

<style scoped>
.stats {
  position: absolute;
  top: 24px;
  right: 0;
  z-index: 30;
  width: 280px;
}

/* 动画容器（transform 过渡——带动整个抽屉滑出；阴影/圆角/pointer-events 都在这里） */
.stats__wrap {
  position: relative;
  width: 280px;
  border-radius: 12px 0 0 12px;
  box-shadow: none;
  transition: transform 220ms cubic-bezier(0.32, 0.72, 0, 1);
  transform: translateX(100%);
  pointer-events: none;
}

.stats--open .stats__wrap {
  transform: translateX(0);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
  pointer-events: auto;
}

/* 打开态一体性：抽屉去 border、按钮去 shadow——阴影收敛到 wrap，交界零分割线 */
.stats--open .stats__drawer {
  border: none;
}

.stats--open .stats__toggle {
  box-shadow: none;
}

/* 抽屉主体（无动画——跟随父容器运动） */
.stats__drawer {
  position: relative;
  max-height: calc(100vh - 48px);
  background: var(--tk-bg-elevated);
  border: 1px solid var(--tk-border-light);
  border-right: none;
  border-radius: 12px 0 0 12px;
  padding: 16px 14px;
  overflow-y: auto;
  scrollbar-width: none;
}

.stats__drawer::-webkit-scrollbar {
  display: none;
}

/* 切换按钮（独立于动画容器——right 切换定位：关=贴右缘 / 开=贴抽屉左缘） */
.stats__toggle {
  position: absolute;
  top: 16%;
  right: 0;
  transform: translateY(-50%);
  width: 20px;
  height: 56px;
  border-radius: 10px 0 0 10px;
  border: 1px solid var(--tk-border-light);
  border-right: none;
  background: var(--tk-bg-elevated);
  color: var(--tk-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.05);
  transition: right 220ms cubic-bezier(0.32, 0.72, 0, 1),
    color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.stats--open .stats__toggle {
  right: 280px;
  color: var(--tk-accent);
}

@media (hover: hover) and (pointer: fine) {
  .stats__toggle:hover {
    color: var(--tk-accent);
    background: var(--tk-bg-secondary);
  }
}

/* 箭头：关闭 < / 打开 >（旋转 180°——emil：指定属性过渡） */
.stats__chevron--open {
  transform: rotate(180deg);
}
.stats__toggle svg {
  transition: transform 220ms cubic-bezier(0.23, 1, 0.32, 1);
}

.stats__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: var(--tk-text-primary);
  margin-bottom: 10px;
}

.stats__model {
  font-size: 10px;
  font-weight: 400;
  color: var(--tk-text-tertiary);
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 上下文占用（顶部模块——三层进度条 + 阈值游标） */
.ctx-block {
  margin-bottom: 14px;
  padding: 10px 12px;
  background: var(--tk-bg-secondary);
  border-radius: 10px;
}

.ctx-block__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.ctx-block__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--tk-text-secondary);
}

.ctx-block__value {
  font-size: 12px;
  font-weight: 600;
  color: var(--tk-text-primary);
  font-variant-numeric: tabular-nums;
}

.ctx-block__percent {
  font-size: 11px;
  margin-left: 6px;
  color: var(--tk-text-secondary);
}

/* 三层轨道（加粗） */
.ctx-block__track {
  position: relative;
  height: 12px;
  border-radius: 6px;
  background: var(--tk-bg-elevated);
  overflow: visible;
  margin-bottom: 6px;
}

.ctx-block__layer {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  border-radius: 6px;
}

/* 底层：上下文窗口总量（全宽浅灰） */
.ctx-block__layer--limit {
  width: 100%;
  background: var(--tk-bg-elevated);
  border: 1px solid var(--tk-border-light);
  box-sizing: border-box;
}

/* 中层：压缩阈值（蓝绿区） */
.ctx-block__layer--threshold {
  background: rgba(94, 92, 230, 0.25);
  border-right: 2px solid #5e5ce6;
  box-sizing: border-box;
}

/* 上层：当前占用（蓝/橙/红分级） */
.ctx-block__layer--used {
  background: var(--tk-accent);
}

.ctx-block__legend {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 10px;
  color: var(--tk-text-tertiary);
}

.ctx-block__legend span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.dot--used {
  background: var(--tk-accent);
}

.dot--threshold {
  background: #5e5ce6;
}

.dot--limit {
  background: var(--tk-border);
}

/* 会话数据（两栏：标题上/数值下） */
.sess-block {
  margin-bottom: 14px;
  padding: 10px 12px;
  background: var(--tk-bg-secondary);
  border-radius: 10px;
}

.sess-block__title {
  font-size: 11px;
  font-weight: 600;
  color: var(--tk-text-secondary);
  margin-bottom: 8px;
}

.sess-block__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 12px;
}

.sess-block__cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sess-block__cell--wide {
  grid-column: span 2;
}

.sess-block__label {
  font-size: 11px;
  color: var(--tk-text-secondary);
}

.sess-block__num {
  font-size: 15px;
  font-weight: 700;
  color: var(--tk-text-primary);
  font-variant-numeric: tabular-nums;
}

/* 平均命中——特殊颜色强调（≥50% 绿 / ≥20% 橙 / 低红） */
.sess-block__num--hit {
  font-weight: 700;
}

.sess-block__num--high {
  color: var(--tk-success);
}

.sess-block__num--mid {
  color: #ff9f0a;
}

.sess-block__num--hit {
  color: var(--tk-destructive);
}

/* 记忆模块已移至 AgentCard——此处样式已删除 */

/* 记忆进度条（底层总量 + 上层使用量叠加——保持细条） */
.stats__bar {
  height: 4px;
  border-radius: 2px;
  background: var(--tk-bg-elevated);
  border: 1px solid var(--tk-border-light);
  box-sizing: border-box;
  overflow: hidden;
}

.stats__bar-fill {
  height: 100%;
  border-radius: 1px;
  background: var(--tk-accent);
  transition: width 0.3s;
}

.stats__bar-fill--blue {
  background: #5e5ce6;
}

.stats__bar-fill--green {
  background: var(--tk-success);
}

.stats__bar-fill--blue {
  background: var(--tk-accent);
}

.stats__sub {
  font-size: 10px;
  color: var(--tk-text-tertiary);
  margin-top: 3px;
}

.stats__empty {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  text-align: center;
  padding: 8px 0;
}
</style>