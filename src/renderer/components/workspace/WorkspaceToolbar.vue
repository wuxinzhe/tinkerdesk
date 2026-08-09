<template>
  <header :class="['workspace-toolbar', `workspace-toolbar--${variant}`]">
    <!-- 汉堡菜单（移动端 L1，非详情时） -->
    <button
      v-if="showMenu"
      class="workspace-toolbar__btn workspace-toolbar__btn--left"
      title="菜单"
      @click="$emit('menu')"
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 5h14M3 10h14M3 15h14" />
      </svg>
    </button>
    <!-- 返回按钮 -->
    <button
      v-else-if="showBack"
      class="workspace-toolbar__btn workspace-toolbar__btn--left"
      title="返回"
      @click="$emit('back')"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>

    <div class="workspace-toolbar__center">
      <!-- 普通标题 -->
      <Transition name="tool-slide" mode="out-in">
        <span
          v-if="!showToolProgress"
          key="title"
          class="workspace-toolbar__title"
        >{{ title }}</span>
        <!-- 工具执行进度（逐个播放） -->
        <div v-else key="tools" class="workspace-toolbar__tools">
          <Transition name="tool-chip-slide" mode="out-in" @after-leave="onChipLeave">
            <div
              v-if="currentChip"
              :key="currentChip.toolCallId + currentChip.status"
              class="tool-chip"
              :class="{ 'tool-chip--done': currentChip.status === 'done' }"
            >
              <span class="tool-chip__icon">{{ currentChip.status === 'done' ? '✅' : '⏳' }}</span>
              <span class="tool-chip__name">{{ getToolDisplayName(currentChip.toolName) }}</span>
            </div>
          </Transition>
        </div>
      </Transition>
    </div>

    <div class="workspace-toolbar__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getToolDisplayName } from '@/renderer/utils/tool-display'

const props = withDefaults(defineProps<{
  title: string
  variant?: 'mobile' | 'l3'
  showBack?: boolean
  showMenu?: boolean
  /** 当前 session 的工具调用列表（仅移动端使用） */
  toolCalls?: { toolCallId: string; toolName: string; status: 'pending' | 'done' }[]
  /** 当前 session 是否正在处理（仅移动端使用） */
  isProcessing?: boolean
}>(), {
  variant: 'l3',
  showBack: false,
  showMenu: false,
  toolCalls: () => [],
  isProcessing: false,
})

defineEmits<{
  back: []
  menu: []
}>()

/* ── 动画队列（保证每个 chip 切换动画完整执行） ── */

// 内部排队队列：按工具原顺序存放
const toolQueue = ref<{ toolCallId: string; toolName: string; done: boolean }[]>([])
// 当前队列索引（-1 = 空闲，展示标题，0+ = 展示第 idx 个工具）
const queueIndex = ref(-1)
// 动画进行中标志（@after-leave 前不允许新的触发）
const animating = ref(false)

/** 当前展示的 chip */
const currentChip = computed(() => {
  const idx = queueIndex.value
  if (idx < 0 || idx >= toolQueue.value.length) return null
  const item = toolQueue.value[idx]
  return { toolCallId: item.toolCallId, toolName: item.toolName, status: item.done ? 'done' : 'pending' }
})

/** 是否显示工具进度（队列中有未播完的工具时） */
const showToolProgress = computed(() =>
  props.variant === 'mobile' && toolQueue.value.length > 0
  && queueIndex.value >= 0 && props.isProcessing
)

/** @after-leave 回调：上一元素的离开动画已结束，推进队列 */
function onChipLeave() {
  animating.value = false
  advanceQueue()
}

/** 推进队列到下一个工具（仅当不在动画中时） */
function advanceQueue() {
  if (animating.value) return
  const idx = queueIndex.value
  // 如果当前展示的工具已标记完成，移到下一个
  if (idx >= 0 && idx < toolQueue.value.length && toolQueue.value[idx].done) {
    queueIndex.value++
    animating.value = true
  }
  // 如果全部播完，回到空闲（外层的 tool-slide 负责切回标题）
  if (queueIndex.value >= toolQueue.value.length) {
    queueIndex.value = -1
  }
}

// ── 监听 prop toolCalls 变化：将最新状态同步到队列 ──
// toolCalls 是从 store 的 toolCallsBySession 传下来的，
// 包含所有工具的最新 done/pidng 状态。
watch(() => props.toolCalls, (calls) => {
  if (!calls || calls.length === 0) {
    // 工具调用被清空（新流覆盖），重置队列
    if (!animating.value) {
      toolQueue.value = []
      queueIndex.value = -1
    }
    return
  }

  // 首次建立队列：按 toolCalls 的原始顺序
  if (toolQueue.value.length === 0 && calls.some(tc => tc.status === 'pending')) {
    toolQueue.value = calls.map(tc => ({
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      done: tc.status === 'done',
    }))
    queueIndex.value = 0
    animating.value = true
    return
  }

  // 后续更新：某个工具变为 done 了 → 同步到队列
  for (const tc of calls) {
    const qItem = toolQueue.value.find(q => q.toolCallId === tc.toolCallId)
    if (qItem && tc.status === 'done' && !qItem.done) {
      qItem.done = true
      // 如果当前就是该工具且不在动画中，触发推进
      if (!animating.value && queueIndex.value >= 0
          && queueIndex.value < toolQueue.value.length
          && toolQueue.value[queueIndex.value].toolCallId === tc.toolCallId) {
        advanceQueue()
      }
    }
  }
}, { deep: true })

// ── 对话完成 → 清掉队列中未播的工具（让动画自然收尾） ──
// conversation_complete 导致 isProcessing=false，
// 此时若队列还有未展示的工具，它们不再有意义。
watch(() => props.isProcessing, (processing) => {
  if (processing) {
    // 新轮次开始 → 清掉上一轮残留（不干扰正在播的动画）
    if (!animating.value) {
      toolQueue.value = []
      queueIndex.value = -1
    }
    return
  }
  // isProcessing 从 true → false：对话完成
  if (queueIndex.value >= 0 && queueIndex.value < toolQueue.value.length - 1) {
    // 保留当前正在播的工具，清掉后面未播的
    toolQueue.value = toolQueue.value.slice(0, queueIndex.value + 1)
  }
})
</script>

<style scoped>
.workspace-toolbar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  overflow: hidden;
}

/* ── 左按钮 ── */

.workspace-toolbar__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.12s;
}

.workspace-toolbar__btn:hover {
  background: var(--tk-bg-secondary);
}

.workspace-toolbar__center {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.workspace-toolbar__title {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--tk-text-primary);
  backface-visibility: hidden;
  will-change: transform, opacity;
}

.workspace-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* Teleport 目标 div（#l3-toolbar-actions / #mobile-toolbar-actions）本身必须是 flex 容器，
   否则块级按钮在 div 内垂直堆叠——多个按钮（如 打断+历史预览）会竖排而不是横排 */
.workspace-toolbar__actions :deep(#l3-toolbar-actions),
.workspace-toolbar__actions :deep(#mobile-toolbar-actions) {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ═══════════════════════════════════════════════════════
   移动端 variant — MobileTopBar 样式
   ═══════════════════════════════════════════════════════ */

.workspace-toolbar--mobile {
  position: relative;
  justify-content: center;
  height: 56px;
  padding: 12px 16px;
  box-sizing: border-box;
  background: var(--tk-bg-primary);
  border-bottom: 1px solid var(--tk-border);
}

.workspace-toolbar--mobile .workspace-toolbar__btn--left {
  position: absolute;
  left: 16px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: var(--tk-accent);
  z-index: 1;   /* 保证在 center 之上可点击 */
}

/* center 限宽居中：左右各留 48px 给按钮区，内容超长时内部截断而非覆盖按钮 */
.workspace-toolbar--mobile .workspace-toolbar__center {
  max-width: calc(100% - 96px);
  margin: 0 auto;
}

.workspace-toolbar--mobile .workspace-toolbar__btn--left:hover {
  background: var(--tk-bg-secondary);
}

.workspace-toolbar--mobile .workspace-toolbar__title {
  font-size: 17px;
  font-weight: 600;
  line-height: 32px;
  text-align: center;
}

.workspace-toolbar--mobile .workspace-toolbar__actions {
  position: absolute;
  right: 12px;
}

.workspace-toolbar--mobile .workspace-toolbar__actions :deep(.toolbar-btn) {
  width: 32px;
  height: 32px;
  border-radius: 8px;
}

/* ═══════════════════════════════════════════════════════
   L3 variant — ToolBarComponent 样式
   ═══════════════════════════════════════════════════════ */

.workspace-toolbar--l3 {
  height: 44px;
  padding: 0 16px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  position: relative;
  z-index: 10;
  box-shadow: 0 0.5px 0 rgba(0, 0, 0, 0.06);
}

:root[data-theme="dark"] .workspace-toolbar--l3,
.dark .workspace-toolbar--l3 {
  background: rgba(30, 30, 30, 0.72);
}

.workspace-toolbar--l3 .workspace-toolbar__btn--left {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  margin-right: 8px;
  color: var(--tk-text-secondary);
}

.workspace-toolbar--l3 .workspace-toolbar__btn--left:hover {
  background: var(--tk-bg-secondary);
}

.workspace-toolbar--l3 .workspace-toolbar__center {
  text-align: center;
}

.workspace-toolbar--l3 .workspace-toolbar__title {
  font-size: 13px;
  font-weight: 600;
  display: inline-block;
  max-width: 100%;
}

.workspace-toolbar--l3 .workspace-toolbar__actions :deep(.toolbar-btn) {
  width: 32px;
  height: 32px;
  border-radius: 9px;
}

/* ── Teleported 动作按钮通用样式（emil：主入口图标按钮——hairline 边框 + 白底浮起，与 Agent List 加号同款） ── */

.workspace-toolbar__actions :deep(.toolbar-btn) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--tk-border-card);
  border-radius: 9px;
  background: var(--tk-bg-primary);
  box-shadow: var(--tk-shadow-card);
  color: var(--tk-accent);
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1),
    box-shadow 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.workspace-toolbar__actions :deep(.toolbar-btn:active) {
  transform: scale(0.97);
}

@media (hover: hover) and (pointer: fine) {
  .workspace-toolbar__actions :deep(.toolbar-btn:hover) {
    background: var(--tk-bg-secondary);
    box-shadow: var(--tk-shadow-card-hover);
  }
}

.workspace-toolbar__actions :deep(.toolbar-btn--danger) {
  color: var(--tk-destructive);
}

.workspace-toolbar__actions :deep(.toolbar-btn--danger:hover) {
  background: color-mix(in srgb, var(--tk-destructive) 10%, transparent);
}

.workspace-toolbar__actions :deep(.toolbar-btn:disabled) {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── 工具执行进度 chips（移动端） ── */

.workspace-toolbar__tools {
  perspective: 600px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.tool-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  overflow: hidden;
  font-size: 17px;
  font-weight: 600;
  backface-visibility: hidden;
  will-change: transform, opacity;
}

.tool-chip__icon {
  font-size: 14px;
  flex-shrink: 0;
}

.tool-chip__name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 15px;
  color: var(--tk-text-primary);
}

.tool-chip--done .tool-chip__name {
  color: var(--tk-text-tertiary);
}

/* ── 标题 ↔ 工具进度 切换动画（3D 透视上下滚动） ── */

.workspace-toolbar__center {
  perspective: 600px;
}

.tool-slide-enter-active {
  transition: all 0.35s ease-out;
}
.tool-slide-leave-active {
  transition: all 0.3s ease-in;
}
.tool-slide-enter-from {
  opacity: 0;
  transform: translateY(28px) rotateX(-10deg) scaleY(0.85);
}
.tool-slide-leave-to {
  opacity: 0;
  transform: translateY(-28px) rotateX(10deg) scaleY(0.85);
}

/* ── chip 逐个轮转动画（3D 透视上下滚动） ── */

.tool-chip-slide-enter-active {
  transition: all 0.35s ease-out;
}
.tool-chip-slide-leave-active {
  transition: all 0.25s ease-in;
}
.tool-chip-slide-enter-from {
  opacity: 0;
  transform: translateY(24px) rotateX(-8deg) scaleY(0.88);
}
.tool-chip-slide-leave-to {
  opacity: 0;
  transform: translateY(-24px) rotateX(8deg) scaleY(0.88);
}
</style>
