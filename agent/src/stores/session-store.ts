/**
 * session-store.ts — 会话/连接/用户状态管理
 *
 * 职责：连接状态 + 用户信息 + 会话 CRUD
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { sessionsApi } from '@/api/sessions-api'
import type { Session } from '@/defines/models/session'
import type { ConnectionStatus, PlatformCapabilities } from '@/defines/session-types'

export const useSessionStore = defineStore('session', () => {
  // ── 连接状态 ──
  const connectionStatus = ref<ConnectionStatus>('disconnected')
  const wsUrl = ref('')

  // ── 当前会话 ──
  const sessionId = ref<string | null>(null)
  const currentSession = ref<Session | null>(null)

  // ── 用户信息 ──
  const profile = ref('default')
  const token = ref<string | null>(null)

  // ── 锁屏 ──
  const isLocked = ref(false)

  // ── 平台能力 ──
  const capabilities = ref<PlatformCapabilities | null>(null)

  // ── Setters ──
  function setConnectionStatus(s: ConnectionStatus) { connectionStatus.value = s }
  function setWsUrl(url: string) { wsUrl.value = url }
  function setSessionId(id: string | null) { sessionId.value = id }
  function setCurrentSession(s: Session | null) { currentSession.value = s }
  function setProfile(p: string) { profile.value = p }
  function setToken(t: string | null) { token.value = t }
  function setLocked(v: boolean) { isLocked.value = v }
  function setCapabilities(c: PlatformCapabilities | null) { capabilities.value = c }

  function $reset() {
    connectionStatus.value = 'disconnected'
    wsUrl.value = ''
    sessionId.value = null
    currentSession.value = null
    profile.value = 'default'
    token.value = null
    isLocked.value = false
    capabilities.value = null
  }

  // ── API：会话 CRUD ──
  async function list(): Promise<Session[]> {
    return sessionsApi.list(profile.value)
  }

  async function create(params: { profile?: string }): Promise<Session> {
    return sessionsApi.create({ profile: params.profile ?? profile.value })
  }

  return {
    // 状态
    connectionStatus, wsUrl, sessionId, currentSession,
    profile, token, isLocked, capabilities,
    // Setters
    setConnectionStatus, setWsUrl, setSessionId, setCurrentSession,
    setProfile, setToken, setLocked, setCapabilities, $reset,
    // API
    list, create
  }
})
