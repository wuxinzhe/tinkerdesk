<template>
  <!-- 无选中会话的空聊天页：直接输入发起对话 → 自动创建新会话并发送 -->
  <ChatAreaComponent
    :messages="[]"
    :streaming-content="''"
    :streaming-reasoning="''"
    :is-streaming="false"
    session-id=""
    :profile="profile"
    :pending-buffer="''"
    @send="onSend"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ChatAreaComponent from '@/renderer/components/workspace/ChatAreaComponent.vue'
import { useSessionStore } from '@/renderer/stores/session-store'
import { useChatStore } from '@/renderer/stores/chat-store'

const route = useRoute()
const router = useRouter()
const sessionStore = useSessionStore()
const chatStore = useChatStore()

const profile = computed(() => (route.params.profile as string) || sessionStore.profile || 'default')

/**
 * 空聊天页发起对话：自动创建新会话（会话列表随之新增 item）——
 * 通过 store 直接发送消息，再跳转进入该会话。
 */
async function onSend(text: string): Promise<void> {
  const s = await sessionStore.create({ profile: profile.value })
  if (!s) return
  sessionStore.setSessionId(s.id)
  chatStore.sendMessage(s.id, text, profile.value)
  router.replace(`/workspace/chat/${s.id}`)
}
</script>
