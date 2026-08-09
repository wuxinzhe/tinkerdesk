<template>
  <!-- 纯工具调用卡片（assistant_tool_call——content 通常为空——工具树为主） -->
  <!-- content 兜底（旧数据/罕见带文本的纯工具轮次；MarkdownRender 根自带 markdown-body） -->
  <MarkdownRender
    v-if="!!message.content"
    :content="message.content"
    :breaks="true"
    :highlight-code="true"
    :render-links="false"
  />
  <!-- 流式接收区：工具参数原始文本（isFinish 前显示——finalize 后由工具树接管） -->
  <Transition name="collapse">
    <div v-if="isStreaming && pendingBuffer" class="streaming-receiver">
      <div class="streaming-receiver__header">
        <span class="streaming-receiver__dot" />
        接收中
      </div>
      <div class="streaming-receiver__body">{{ pendingBuffer }}</div>
    </div>
  </Transition>

  <!-- 工具树（多工具纵向——顺序感；无 content 时首行不留 16px 间距） -->
  <ToolCallTree
    :tool-call="message.toolCall"
    :tool-call-name="message.toolCallName"
    :first-gap="message.content ? 16 : 0"
  />
</template>

<script setup lang="ts">
import MarkdownRender from '@/renderer/components/MarkdownRender.vue'
import ToolCallTree from './ToolCallTree.vue'
import type { Message } from '@/renderer/api/types'

defineProps<{
  message: Message
  isStreaming?: boolean
  pendingBuffer?: string
}>()
</script>

<style scoped>
/* 流式接收区（与气泡组件同款：呼吸圆点 + hairline 边框） */
.streaming-receiver {
  margin-top: 6px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--tk-bg-tertiary);
  border: 1px solid var(--tk-border-light);
  font-size: 12px;
  line-height: 1.6;
}

.streaming-receiver__header {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--tk-text-tertiary);
  font-size: 11px;
  margin-bottom: 4px;
}

.streaming-receiver__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tk-accent);
  animation: receiver-pulse 1.2s ease-in-out infinite;
}

@keyframes receiver-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.15); }
}

.streaming-receiver__body {
  color: var(--tk-text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
}

/* Collapse transition（emil：指定属性 + 强 ease-out） */
.collapse-enter-active {
  transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1),
    max-height 240ms cubic-bezier(0.23, 1, 0.32, 1),
    padding-top 240ms cubic-bezier(0.23, 1, 0.32, 1),
    padding-bottom 240ms cubic-bezier(0.23, 1, 0.32, 1);
}
.collapse-leave-active {
  transition: opacity 140ms cubic-bezier(0.23, 1, 0.32, 1),
    max-height 180ms cubic-bezier(0.23, 1, 0.32, 1),
    padding-top 180ms cubic-bezier(0.23, 1, 0.32, 1),
    padding-bottom 180ms cubic-bezier(0.23, 1, 0.32, 1);
}
.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  overflow: hidden;
}
</style>
