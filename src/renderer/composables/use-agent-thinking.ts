/**
 * use-agent-thinking.ts — 全局 Agent 思考状态共享 composable
 *
 * 模块级单例 ref，所有调用者共享同一个 isThinking 状态。
 * 监听 conversation-start / conversation-complete 窗口事件
 * 以及 sessionStore.sessionId + chatStore.isProcessingBySession 变化。
 *
 * 用法：
 *   // 在需要管理生命周期的组件中初始化
 *   useSetupThinking()
 *
 *   // 任意组件只需读取状态
 *   const { isThinking } = useThinkingState()
 */

import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useSessionStore } from '@/renderer/stores/session-store'
import { useChatStore } from '@/renderer/stores/chat-store'

/* ═══════════════════════════════════════════
   模块级单例
   ═══════════════════════════════════════════ */

const isThinking = ref(false)

/**
 * 获取只读的 thinking 状态 ref。
 * 无需生命周期管理，任意组件都可以调用。
 */
export function useThinkingState() {
  return { isThinking }
}

/**
 * 初始化 thinking 状态：注册事件监听 + sessionId/watch。
 * 必须在组件的 setup() 中调用才能绑定生命周期。
 * 安全可重入：多个组件同时调用不会冲突。
 */
export function useSetupThinking() {
  const sessionStore = useSessionStore()
  const chatStore = useChatStore()

  /* ── 窗口事件 ── */

  function handleConversationStart(e: Event) {
    const { sessionId } = (e as CustomEvent).detail ?? {}
    if (sessionId === sessionStore.sessionId) {
      isThinking.value = true
    }
  }

  function handleConversationComplete(e: Event) {
    const { sessionId } = (e as CustomEvent).detail ?? {}
    if (sessionId === sessionStore.sessionId) {
      isThinking.value = false
    }
  }

  /* ── sessionId 变化时同步 processing 状态 ── */

  watch(() => sessionStore.sessionId, (sid) => {
    isThinking.value = sid ? (chatStore.isProcessingBySession[sid] ?? false) : false
  }, { immediate: true })

  /* ── 生命周期 ── */

  onMounted(() => {
    window.addEventListener('conversation-start', handleConversationStart)
    window.addEventListener('conversation-complete', handleConversationComplete)
  })

  onUnmounted(() => {
    window.removeEventListener('conversation-start', handleConversationStart)
    window.removeEventListener('conversation-complete', handleConversationComplete)
  })

  return { isThinking }
}
