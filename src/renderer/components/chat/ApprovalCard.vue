<template>
  <div
    class="approval-card"
    :class="`approval-card--${displayStatus}`"
  >
    <!-- Header -->
    <div class="approval-card__header">
      <span class="approval-card__icon">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </span>
      <span class="approval-card__title">命令执行审批</span>
      <span class="approval-card__badge">{{ displayName }}</span>
    </div>

    <!-- Args code block -->
    <div v-if="approvalArguments" class="approval-card__code">
      <div class="approval-card__code-inner">
        <div class="approval-card__code-bar">
          <span class="approval-card__code-lang">参数</span>
          <button class="approval-card__copy" @click.stop="copyArgs">复制</button>
        </div>
        <pre class="approval-card__code-body"><code>{{ formatArgs(approvalArguments) }}</code></pre>
      </div>
    </div>

    <!-- 审批说明 -->
    <div class="approval-card__body">
      <div class="approval-card__question">是否允许执行该命令？</div>
      <div class="approval-card__desc">执行代码脚本。该脚本可以在不经过终端命令审批的情况下生成子进程或修改文件；此次运行仅需一次审批。</div>
    </div>

    <!-- 底部操作栏 -->
    <template v-if="displayStatus === 'pending'">
      <div class="approval-card__expiry">⏱ 审批超时时间：10分钟</div>
      <div class="approval-card__actions">
        <button class="approval-card__btn approval-card__btn--reject" @click="$emit('reject', toolCallId)">拒绝</button>
        <button class="approval-card__btn approval-card__btn--approve" @click="$emit('approve', toolCallId)">批准</button>
      </div>
    </template>
    <div v-else-if="displayStatus === 'timed_out'" class="approval-card__actions approval-card__actions--resolved">
      <span class="approval-card__clock">⏰</span>
      <span>已过期</span>
    </div>
    <div v-else class="approval-card__actions approval-card__actions--resolved">
      <span v-if="displayStatus === 'approved'" class="approval-card__check">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </span>
      <span v-else class="approval-card__x">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </span>
      <span>{{ displayStatus === 'approved' ? '已批准' : '已拒绝' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getShortName } from '@/renderer/utils/tool-display'

const props = withDefaults(defineProps<{
  interactionStatus?: string
  approvalStatus?: string
  toolName?: string
  approvalArguments?: unknown
  toolCallId: string
}>(), {
  interactionStatus: 'pending',
  toolName: '',
  approvalArguments: undefined,
  toolCallId: '',
})

/** 优先使用 interactionStatus（新通用字段），向后兼容 approvalStatus */
const displayStatus = computed(() => props.interactionStatus || props.approvalStatus || 'pending')

const displayName = computed(() => getShortName(props.toolName || ''))

defineEmits<{
  approve: [toolCallId: string]
  reject: [toolCallId: string]
}>()

/** 将参数格式化为带缩进的 JSON，兼容新旧格式 */
function formatArgs(args: unknown): string {
  if (args === null || args === undefined) return ''
  // 旧数据：后端曾返回 JSON 字符串 → 尝试解析后缩进
  if (typeof args === 'string') {
    try {
      return JSON.stringify(JSON.parse(args), null, 2)
    } catch {
      return args
    }
  }
  // 新数据：直接是对象
  return JSON.stringify(args, null, 2)
}

function copyArgs() {
  if (!props.approvalArguments) return
  const text = formatArgs(props.approvalArguments)
  navigator.clipboard.writeText(text).catch(() => {})
}
</script>

<style scoped>
.approval-card {
  background: var(--sa-bg-primary, #ffffff);
  border-radius: 12px;
  margin: 8px 0;
  overflow: hidden;
  font-size: 13px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  border: 1px solid rgba(0,0,0,0.05);
  width: 100%;
  box-sizing: border-box;
}

.approval-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
}

.approval-card__icon {
  display: flex;
  align-items: center;
  color: var(--sa-text-secondary, #86868b);
}

.approval-card__title {
  font-weight: 600;
  font-size: 13px;
  color: var(--sa-text-primary, #1d1d1f);
  letter-spacing: -0.01em;
}

.approval-card__badge {
  margin-left: auto;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(0,0,0,0.04);
  color: var(--sa-text-secondary, #86868b);
  font-weight: 500;
}

.approval-card__code {
  padding: 0 16px;
}

.approval-card__code-inner {
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 8px;
  background: var(--sa-bg-secondary, #f5f5f7);
}

.approval-card__code-bar {
  display: flex;
  align-items: center;
  padding: 7px 12px;
  background: transparent;
  border-bottom: 1px solid var(--sa-border, #d2d2d7);
}

.approval-card__code-lang {
  font-size: 11px;
  color: var(--sa-text-tertiary, #aeaeb2);
  font-weight: 500;
}

.approval-card__copy {
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  color: var(--sa-accent, #007aff);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: inherit;
  transition: background 0.15s ease;
}

.approval-card__copy:hover {
  background: rgba(0, 122, 255, 0.08);
}

.approval-card__code-body {
  margin: 0;
  background: transparent;
  padding: 10px 12px;
  max-height: 240px;
  overflow: auto;
}

.approval-card__code-body code {
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  color: var(--sa-text-secondary, #86868b);
  white-space: pre;
  line-height: 1.6;
}

.approval-card__body {
  padding: 14px 16px 0;
}

.approval-card__question {
  font-size: 13px;
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
  letter-spacing: -0.01em;
  line-height: 20px;
  margin-bottom: 4px;
}

.approval-card__desc {
  font-size: 12px;
  color: var(--sa-text-tertiary, #aeaeb2);
  line-height: 18px;
  letter-spacing: -0.01em;
}

.approval-card__expiry {
  padding: 6px 16px 0;
  font-size: 11px;
  color: var(--sa-text-tertiary, #aeaeb2);
  line-height: 1;
  text-align: right;
}

.approval-card__actions {
  display: flex;
  gap: 10px;
  padding: 14px 16px;
}

.approval-card__btn {
  flex: 1;
  height: 36px;
  border-radius: 18px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  font-family: inherit;
  letter-spacing: -0.01em;
  transition: opacity 0.15s ease;
}

.approval-card__btn:active {
  opacity: 0.7;
}

.approval-card__btn--reject {
  background: transparent;
  color: var(--sa-destructive, #ff3b30);
  border: 1px solid rgba(255, 59, 48, 0.2);
}

.approval-card__btn--reject:hover {
  background: rgba(255, 59, 48, 0.06);
}

.approval-card__btn--approve {
  background: var(--sa-accent, #007aff);
  color: #ffffff;
}

.approval-card__btn--approve:hover {
  opacity: 0.85;
}

.approval-card__actions--resolved {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--sa-text-primary, #1d1d1f);
  line-height: 20px;
}

.approval-card__check {
  display: flex;
  color: var(--sa-success, #34c759);
}

.approval-card__clock {
  font-size: 14px;
  line-height: 1;
}

.approval-card__x {
  display: flex;
  color: var(--sa-destructive, #ff3b30);
}
</style>
