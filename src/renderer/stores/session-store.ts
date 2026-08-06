/**
 * session-store.ts — 会话/用户状态管理
 *
 * 职责：当前会话 + 用户 profile + 锁屏
 * （连接状态已删除；token/list 为死代码已删除）
 */
import { sessionsApi } from '@/renderer/api/sessions-api'
import type { Session } from '@/renderer/api/types'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSessionStore = defineStore('session', () => {
  // ── 当前会话 ──
  const sessionId = ref<string | null>(null)
  const currentSession = ref<Session | null>(null)

  // ── 用户信息 ──
  const profile = ref('default')

  // ── 锁屏 ──
  const isLocked = ref(false)

  // ── Setters ──
  function setSessionId(id: string | null) { sessionId.value = id }
  function setCurrentSession(s: Session | null) { currentSession.value = s }
  function setProfile(p: string) { profile.value = p }
  function setLocked(v: boolean) { isLocked.value = v }

  function $reset() {
    sessionId.value = null
    currentSession.value = null
    profile.value = 'default'
    isLocked.value = false
  }

  // ── API：创建会话 ──
  async function create(params: { profile?: string }): Promise<Session> {
    return sessionsApi.create({ profile: params.profile ?? profile.value })
  }

  return {
    // 状态
    sessionId, currentSession,
    profile, isLocked,
    // Setters
    setSessionId, setCurrentSession,
    setProfile, setLocked, $reset,
    // API
    create
  }
})
