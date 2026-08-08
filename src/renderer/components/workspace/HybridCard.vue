<template>
  <!-- 文本+工具混合卡片（assistant_hybrid——content 正文 + 工具树） -->
  <!-- 正文（流式 Markdown——与 assistant_text 相同管线；MarkdownRender 根自带 markdown-body） -->
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
        <span class="streaming-receiver__dot" />📡 信息接收中…
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
.streaming-receiver {
  margin-top: 6px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--sa-bg-secondary, #f5f5f7);
  font-size: 12px;
  line-height: 1.6;
}

.streaming-receiver__header {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--sa-text-tertiary, #aeaeb2);
  font-size: 11px;
  margin-bottom: 4px;
}

.streaming-receiver__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sa-accent, #007aff);
  animation: receiver-pulse 1s ease-in-out infinite;
}

@keyframes receiver-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.streaming-receiver__body {
  color: var(--sa-text-secondary, #48484a);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
}
</style>
