<script setup lang="ts">
/**
 * GlobalTipToast.vue — 全局通知提示组件（右上角 tips，Apple HIG 风格）
 *
 * 统一消息出口：
 * - type: 'tip'   → 普通通知（浅色中性样式）——来自 main 的 agent:queueTip 出口 / showInfoToast
 * - type: 'error' → 错误提示（红色样式）——来自 preload inv 失败拦截 / showErrorToast
 *
 * 两种类型共用一条 FIFO 队列：一次只显示一条，手动关闭 → 出场动画 → 下一条进入。
 * 不自动关闭，必须用户点击关闭按钮。
 *
 * 事件格式：
 *   window.dispatchEvent(new CustomEvent('global-tip', {
 *     detail: { type: 'error' | 'tip', code?, message }
 *   }))
 */
import { ref, onMounted, onUnmounted } from 'vue'

type TipType = 'error' | 'tip'

interface TipItem {
  id: number
  type: TipType
  code?: string
  message: string
}

interface GlobalTipDetail {
  type?: TipType
  code?: string
  message?: string
}

const queue = ref<TipItem[]>([])
const current = ref<TipItem | null>(null)
/** 出场动画播放中（阻止下一条提前进入） */
const animating = ref(false)
let nextId = 1

function showNext(): void {
  if (queue.value.length === 0) {
    current.value = null
    return
  }
  current.value = queue.value.shift() ?? null
}

function maybeShowNext(): void {
  if (!current.value && !animating.value) {
    showNext()
  }
}

/** 入队（外部通过事件触发） */
function push(item: Omit<TipItem, 'id'>): void {
  queue.value.push({ ...item, id: nextId++ })
  maybeShowNext()
}

/** 手动关闭当前提示（触发出场动画，动画结束后显示下一条） */
function closeCurrent(): void {
  if (!current.value) return
  animating.value = true
  current.value = null
}

/** 出场动画执行完毕 → 允许下一条进入 */
function onLeaveDone(): void {
  animating.value = false
  showNext()
}

function onGlobalTip(e: Event): void {
  const detail = (e as CustomEvent<GlobalTipDetail>).detail
  if (detail && detail.message) {
    push({
      type: detail.type === 'error' ? 'error' : 'tip',
      code: detail.code,
      message: detail.message,
    })
  }
}

onMounted(() => window.addEventListener('global-tip', onGlobalTip))
onUnmounted(() => window.removeEventListener('global-tip', onGlobalTip))
</script>

<template>
  <Teleport to="body">
    <Transition name="gtoast" @after-leave="onLeaveDone">
      <div
        v-if="current"
        class="gtoast"
        :class="`gtoast--${current.type}`"
        role="alert"
      >
        <!-- 类型图标：error = 红色感叹号圆；tip = 中性信息圆点 -->
        <svg
          v-if="current.type === 'error'"
          class="gtoast__icon" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <svg
          v-else
          class="gtoast__icon" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 15.5v.5" />
        </svg>

        <div class="gtoast__body">
          <div v-if="current.code" class="gtoast__code">{{ current.code }}</div>
          <div class="gtoast__text">{{ current.message }}</div>
        </div>

        <!-- 手动关闭按钮（不自动关闭） -->
        <button class="gtoast__close" title="关闭" aria-label="关闭" @click="closeCurrent">
          <svg width="9" height="9" viewBox="0 0 8 8" fill="none" stroke="currentColor"
            stroke-width="1.2" stroke-linecap="round">
            <path d="M2 2l4 4M6 2L2 6" />
          </svg>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── Apple HIG：右上角固定、卡片式、8pt 网格 ── */
.gtoast {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 3000;
  display: flex;
  align-items: flex-start;
  gap: var(--sa-space-3, 12px);
  max-width: 380px;
  min-width: 260px;
  padding: var(--sa-space-3, 12px) var(--sa-space-4, 16px);
  background: var(--sa-bg-elevated, #ffffff);
  border-radius: var(--sa-radius-lg, 12px);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.08),
    0 1px 3px rgba(0, 0, 0, 0.04);
  -webkit-font-smoothing: antialiased;
}

/* ── 类型差异：error = 红边框/红图标；tip = 灰边框/灰图标 ── */
.gtoast--error {
  border: 1px solid var(--sa-border-error, #ff3b30);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.08),
    0 0 0 3px rgba(255, 59, 48, 0.12);
}

.gtoast--error .gtoast__icon {
  color: var(--sa-destructive, #ff3b30);
}

.gtoast--error .gtoast__code {
  color: var(--sa-destructive, #ff3b30);
}

.gtoast--tip {
  border: 1px solid var(--sa-border, #d2d2d7);
}

.gtoast--tip .gtoast__icon {
  color: var(--sa-accent, #007aff);
}

.gtoast--tip .gtoast__code {
  color: var(--sa-text-tertiary, #aeaeb2);
}

.gtoast__icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.gtoast__body {
  display: flex;
  flex-direction: column;
  gap: var(--sa-space-1, 4px);
  min-width: 0;
}

.gtoast__code {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  word-break: break-all;
}

.gtoast__text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--sa-text-primary, #1d1d1f);
  word-break: break-word;
}

.gtoast__close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin: -4px -6px 0 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--sa-text-tertiary, #86868b);
  cursor: pointer;
  transition: background-color 0.2s ease-in-out, color 0.2s ease-in-out;
}

.gtoast__close:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--sa-text-primary, #1d1d1f);
}

.gtoast__close:active {
  background: rgba(0, 0, 0, 0.08);
}

/* ── 入场：从右侧滑入 + 淡入（0.2s ease-out） ── */
.gtoast-enter-active {
  transition: opacity 0.2s ease-out, transform 0.2s ease-out;
}

.gtoast-enter-from {
  opacity: 0;
  transform: translateX(24px);
}

/* ── 出场：淡出 + 轻微上移（0.2s ease-in） ── */
.gtoast-leave-active {
  transition: opacity 0.2s ease-in, transform 0.2s ease-in;
}

.gtoast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* prefers-reduced-motion：关闭动画 */
@media (prefers-reduced-motion: reduce) {
  .gtoast-enter-active,
  .gtoast-leave-active {
    transition: none;
  }
}
</style>
