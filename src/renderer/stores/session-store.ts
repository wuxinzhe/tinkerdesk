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

  // ── 用户信息（当前 Agent——localStorage 持久化：切 agent/刷新后保持） ──
  const PROFILE_KEY = 'tinkerdesk:active-profile'
  const profile = ref<string>(localStorage.getItem(PROFILE_KEY) || 'default')

  // ── 锁屏 ──
  const isLocked = ref(false)

  // ── Setters ──
  function setSessionId(id: string | null) { sessionId.value = id }
  function setCurrentSession(s: Session | null) { currentSession.value = s }
  function setProfile(p: string) {
    profile.value = p
    localStorage.setItem(PROFILE_KEY, p)
  }
  function setLocked(v: boolean) { isLocked.value = v }

  function $reset() {
    sessionId.value = null
    currentSession.value = null
    profile.value = 'default'
    localStorage.removeItem(PROFILE_KEY)
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
