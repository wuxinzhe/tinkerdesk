<script setup lang="ts">
/**
 * ChatWelcomeView.vue — 工作区默认对话页面（无会话时——欢迎态 + 开始新对话）
 *
 * 核心原则：工作区启动默认 = 对话页面；功能列表在侧边栏。
 * 点击"开始对话"→ 创建新会话 → 工作区切 chat/:sessionId。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/renderer/stores/session-store'
import { useAgentStore } from '@/renderer/stores/agent-store'

const route = useRoute()
const router = useRouter()
const sessionStore = useSessionStore()
const agentStore = useAgentStore()

const agent = computed(() => agentStore.currentAgent)
const profile = computed(() => (route.params.profile as string) || 'default')

async function startChat(): Promise<void> {
  const s = await sessionStore.create({ profile: profile.value })
  if (s) router.push(`/workspace/chat/${s.id}`)
}
</script>

<template>
  <div class="chat-welcome">
    <div class="chat-welcome__inner">
      <div class="chat-welcome__avatar">
        <img v-if="agent?.avatar" :src="agent.avatar" alt="" class="chat-welcome__avatar-img" />
        <img v-else src="/default_avatar.png" alt="" class="chat-welcome__avatar-img" />
      </div>
      <h1 class="chat-welcome__title">{{ agent?.displayName || '对话' }}</h1>
      <p class="chat-welcome__desc">
        {{ agent?.description || '开始一段新的对话' }}
      </p>
      <button class="chat-welcome__start" @click="startChat">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        开始对话
      </button>
      <p class="chat-welcome__hint">选择侧边栏中的会话，或开启新对话</p>
    </div>
  </div>
</template>

<style scoped>
.chat-welcome {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.chat-welcome__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 360px;
  text-align: center;
  padding: 32px;
}

.chat-welcome__avatar-img {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
}

.chat-welcome__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--tk-text-primary);
}

.chat-welcome__desc {
  margin: 0;
  font-size: 12px;
  color: var(--tk-text-tertiary);
}

.chat-welcome__start {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  color: #fff;
  background: var(--tk-accent);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1), background 160ms ease;
}

.chat-welcome__start:active {
  transform: scale(0.97);
}

@media (hover: hover) and (pointer: fine) {
  .chat-welcome__start:hover {
    background: rgba(0, 122, 255, 0.85);
  }
}

.chat-welcome__hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--tk-text-tertiary);
}
</style>
