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
      :pending-buffer="pendingBuffer"
      @load-more="$emit('load-more')"
      @approve="(id: string) => $emit('approve', id)"
      @reject="(id: string) => $emit('reject', id)"
      @deleted="$emit('deleted')"
    />

    <ChatInputComponent
      :model-value="inputText"
      :session-id="sessionId"
      :yolo="yoloEnabled"
      @send="onSend"
      @update:model-value="inputText = $event"
      @update:yolo="yoloEnabled = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Message } from '@/defines/models/message'
import MessageListComponent from './MessageListComponent.vue'
import ChatInputComponent from './ChatInputComponent.vue'

defineProps<{
  messages: Message[]
  streamingContent: string
  streamingReasoning: string
  isStreaming: boolean
  sessionId: string | null
  hasMore: boolean
  loadingMore: boolean
  pendingBuffer: string
}>()

const emit = defineEmits<{
  send: [content: string]
  'load-more': []
  approve: [toolCallId: string]
  reject: [toolCallId: string]
  deleted: []
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
