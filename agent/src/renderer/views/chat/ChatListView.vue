<template>
  <div class="sidebar-wrapper">
    <aside :class="['sidebar', { collapsed }]">
      <div class="sidebar__inner">
        <AgentCard
          :agent="agent"
          :thinking-active="isThinking"
          @switch-agent="onSwitchAgent"
        />

        <SessionList
          ref="sessionListRef"
          :active-session-id="sessionStore.sessionId"
          :profile="sessionStore.profile"
          @select="onSelect"
          @new-session="onNewSession"
        />
      </div>
    </aside>

    <button
      class="sidebar-toggle"
      :class="{ collapsed }"
      :title="collapsed ? '展开会话列表' : '折叠会话列表'"
      @click="collapsed = !collapsed"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline v-if="!collapsed" points="15 18 9 12 15 6" />
        <polyline v-else points="9 18 15 12 9 6" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { inject, ref, computed, watch, onMounted } from 'vue'
import type { Ref } from 'vue'
import { useRouter } from 'vue-router'
import AgentCard from '@/renderer/components/chat/AgentCard.vue'
import SessionList from '@/renderer/components/chat/SessionList.vue'
import { useSessionStore } from '@/stores/session-store'
import { useChatStore } from '@/renderer/stores/chat-store'
import { useAgentStore } from '@/stores/agent-store'
import { useSetupThinking, useThinkingState } from '@/renderer/composables/use-agent-thinking'

const router = useRouter()
const sessionStore = useSessionStore()
const chatStore = useChatStore()
const agentStore = useAgentStore()

const collapsed = inject<Ref<boolean>>('sidebar-collapsed', ref(false))
const sessionListRef = ref<InstanceType<typeof SessionList> | null>(null)

/* ── Agent 信息 ── */
const profile = computed(() => sessionStore.profile)
watch(profile, (p) => { agentStore.loadCurrentAgent(p || '') }, { immediate: true })
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
  border-right: 1px solid var(--sa-border, #d2d2d7);
  background: var(--sa-bg-primary, #ffffff);
  height: 100%;
  flex-shrink: 0;
  overflow: hidden;
  transition: width 0.2s ease;
}

.sidebar.collapsed {
  width: 0;
  border-right: none;
}

.sidebar__inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 280px;
  flex-shrink: 0;
}

.sidebar-toggle {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%) translateX(50%);
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 40px;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 0 6px 6px 0;
  background: var(--sa-bg-primary, #ffffff);
  color: var(--sa-text-tertiary, #aeaeb2);
  cursor: pointer;
  padding: 0;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
  border-left: none;
}

.sidebar-toggle:hover {
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-accent, #007aff);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.sidebar-toggle.collapsed {
  border-radius: 6px 0 0 6px;
  border-left: 1px solid var(--sa-border, #d2d2d7);
  border-right: none;
}

@media (max-width: 1023px) {
  .sidebar,
  .sidebar__inner {
    width: 100%;
  }
}
</style>
