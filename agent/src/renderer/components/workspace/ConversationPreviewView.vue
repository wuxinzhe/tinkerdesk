<template>
  <div class="preview-view" @scroll="onScroll">
    <div v-if="loading && cards.length === 0" class="preview-view__state">加载中…</div>
    <div v-else-if="error && cards.length === 0" class="preview-view__state preview-view__state--error">
      {{ error }}
    </div>
    <div v-else-if="cards.length === 0" class="preview-view__state">暂无历史对话</div>

    <div v-else class="preview-view__grid">
      <SessionPreviewCard
        v-for="card in cards"
        :key="card.conversationId"
        :card="card"
        @open="onOpen"
      />
    </div>

    <div v-if="loading && cards.length > 0" class="preview-view__more">加载更多…</div>
    <div v-else-if="!hasMore && cards.length > 0" class="preview-view__more">已加载全部</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import SessionPreviewCard from '@/renderer/components/workspace/SessionPreviewCard.vue'
import { useConversationCards } from '@/renderer/composables/useConversationCards'

const props = defineProps<{
  sessionId: string
}>()

const router = useRouter()
const { cards, loading, hasMore, error, loadPage, reset } = useConversationCards()

function onOpen(conversationId: string) {
  router.push(`/workspace/chat/${props.sessionId}/conversation/${conversationId}`)
}

function onScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
    loadPage(props.sessionId)
  }
}

onMounted(() => {
  reset()
  loadPage(props.sessionId)
})

onUnmounted(() => {
  reset()
})
</script>

<style scoped>
.preview-view {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  box-sizing: border-box;
}

.preview-view__grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-content: start;
}

.preview-view__state {
  padding: 48px 0;
  text-align: center;
  color: var(--sa-text-tertiary, #aeaeb2);
  font-size: 14px;
}

.preview-view__state--error {
  color: var(--sa-destructive, #ff3b30);
}

.preview-view__more {
  padding: 16px 0;
  text-align: center;
  color: var(--sa-text-tertiary, #aeaeb2);
  font-size: 12px;
}
</style>
