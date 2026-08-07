<template>
  <div class="chat-area">
    <MessageListComponent
      :messages="messages"
      :streaming-content="streamingContent"
      :streaming-reasoning="streamingReasoning"
      :is-streaming="isStreaming"
      :session-id="sessionId"
      :has-more="hasMore"
      :loading-more="loadingMore"
      :switching-session="switchingSession"
      :pending-buffer="pendingBuffer"
      @load-more="$emit('load-more')"
      @approve="(id: string) => $emit('approve', id)"
      @reject="(id: string) => $emit('reject', id)"
      @auto-approve="(id: string) => $emit('auto-approve', id)"
      @deleted="$emit('deleted')"
    />

    <ChatInputComponent
      :model-value="inputText"
      :session-id="sessionId"
      :profile="profile"
      :yolo="yoloEnabled"
      @send="onSend"
      @update:model-value="inputText = $event"
      @update:yolo="yoloEnabled = $event"
      @history-preview="$emit('history-preview')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Message } from '@/renderer/api/types'
import MessageListComponent from './MessageListComponent.vue'
import ChatInputComponent from './ChatInputComponent.vue'

defineProps<{
  messages: Message[]
  streamingContent: string
  streamingReasoning: string
  isStreaming: boolean
  sessionId: string | null
  /** Agent 画像标识（透传给 ChatInput 做 YOLO 限定） */
  profile?: string
  hasMore?: boolean
  loadingMore?: boolean
  /** 切换 session 加载态（独立——覆盖层不看消息缓存，任何切换都显示） */
  switchingSession?: boolean
  pendingBuffer: string
}>()

const emit = defineEmits<{
  send: [content: string]
  'load-more': []
  approve: [toolCallId: string]
  reject: [toolCallId: string]
  'auto-approve': [toolCallId: string]
  deleted: []
  'history-preview': []
}>()

const inputText = ref('')
const yoloEnabled = ref(false)

function onSend(content: string) {
  emit('send', content)
}
</script>

<style scoped>
.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
</style>
