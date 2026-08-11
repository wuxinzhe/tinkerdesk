<template>
  <div class="preview-card" @click="$emit('open', card.conversationId)">
    <div class="preview-card__header">
      <span class="preview-card__time">{{ formatTime(card.createdAt) }}</span>
      <span class="preview-card__count">⚙️ {{ card.messageCount }} 条消息</span>
    </div>

    <div class="preview-card__user">
      <span class="preview-card__label">问</span>
      <p class="preview-card__text">
        {{ card.userContent || '（空）' }}
      </p>
    </div>

    <div class="preview-card__divider">
      <span class="preview-card__divider-line" />
    </div>

    <div v-if="card.hasToolCalls" class="preview-card__tools">
      🔧 调用过工具
    </div>

    <div v-if="card.replyPreview" class="preview-card__reply">
      <span class="preview-card__label preview-card__label--ai">答</span>
      <p class="preview-card__text preview-card__text--ai">
        {{ card.replyPreview }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ConversationCard } from '@/renderer/composables/useConversationCards'

defineProps<{
  card: ConversationCard
}>()

defineEmits<{
  open: [conversationId: string]
}>()

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
.preview-card {
  background: var(--tk-bg-primary);
  border: 1px solid var(--tk-border);
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.15s, border-color 0.15s;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.preview-card:hover {
  border-color: var(--tk-accent);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.preview-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.preview-card__time {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  white-space: nowrap;
}

.preview-card__count {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  white-space: nowrap;
}

.preview-card__user,
.preview-card__reply {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  min-width: 0;
}

.preview-card__label {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: var(--tk-accent);
  color: #fff;
  font-size: 11px;
  line-height: 20px;
  text-align: center;
}

.preview-card__label--ai {
  background: var(--tk-accent-secondary);
}

.preview-card__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--tk-text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
  min-width: 0;
}

.preview-card__text--ai {
  color: var(--tk-text-secondary);
}

.preview-card__divider {
  display: flex;
  align-items: center;
}

.preview-card__divider-line {
  flex: 1;
  height: 1px;
  background: var(--tk-border);
}

.preview-card__tools {
  font-size: 12px;
  color: var(--tk-text-secondary);
}
</style>
