<template>
  <div class="sidebar-wrapper">
    <!-- 折叠由外层 WorkspaceView 的 lv2-col 统一控制（动画也统一在外层） -->
    <aside class="sidebar">
      <div class="sidebar__inner">
        <SessionList
          ref="sessionListRef"
          :active-session-id="sessionStore.sessionId"
          :profile="sessionStore.profile"
          @select="onSelect"
          @new-session="onNewSession"
        />
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import AgentCard from '@/renderer/components/chat/AgentCard.vue'
import SessionList from '@/renderer/components/chat/SessionList.vue'
import { useSessionStore } from '@/renderer/stores/session-store'
import { useChatStore } from '@/renderer/stores/chat-store'
import { useAgentStore } from '@/renderer/stores/agent-store'
import { useSetupThinking, useThinkingState } from '@/renderer/composables/use-agent-thinking'

const router = useRouter()
const sessionStore = useSessionStore()
const chatStore = useChatStore()
const agentStore = useAgentStore()
const sessionListRef = ref<InstanceType<typeof SessionList> | null>(null)

/* ── Agent 信息 ── */
const profile = computed(() => sessionStore.profile)
watch(profile, (p) => { agentStore.loadCurrentAgent(p || '', true) }, { immediate: true })
const agent = computed(() => agentStore.currentAgent)

/* ── Thinking 状态（共享） ── */
useSetupThinking()
const { isThinking } = useThinkingState()

/* ── Session events ── */
function onSelect(sessionId: string) {
  sessionStore.setSessionId(sessionId)
  router.push(`/workspace/chat/${sessionId}`)
}

function onSwitchAgent() {
  router.push('/workspace/agents')
}

const creatingSession = ref(false)

async function onNewSession() {
  if (creatingSession.value) return
  creatingSession.value = true
  const tempId = sessionListRef.value?.pendingSessionId
  const newSession = await sessionStore.create({ profile: sessionStore.profile })
  if (!newSession) {
    sessionListRef.value?.removePendingSession()
    creatingSession.value = false
    console.error('Failed to create session')
    return
  }
  if (tempId) {
    sessionListRef.value?.resolvePendingSession(tempId, newSession)
  }
  sessionStore.setSessionId(newSession.id)
  sessionStore.setCurrentSession(newSession)
  chatStore.clearMessages()
  creatingSession.value = false
  router.push(`/workspace/chat/${newSession.id}`)
}
</script>

<style scoped>
.sidebar-wrapper {
  display: flex;
  height: 100%;
  position: relative;
  min-width: 0;
}

.sidebar {
  width: 280px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--tk-border);
  background: transparent;
  height: 100%;
  flex-shrink: 0;
  overflow: hidden;
}

.sidebar__inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 280px;
  flex-shrink: 0;
}

@media (max-width: 1023px) {
  .sidebar,
  .sidebar__inner {
    width: 100%;
  }
}
</style>
