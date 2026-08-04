/**
 * auth-store.ts — 认证管理域
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { authApi, logoutAndClear } from '@/api/auth-api'
import type { TokenResponse, EmailCodeResponse } from '@/defines/api/auth-types'
import { tokenManager } from '@/services/security/token-manager'

export const useAuthStore = defineStore('auth', () => {
  const isLoggedIn = ref(false)
  const checking = ref(true)

  function hasToken(): boolean {
    return tokenManager.hasAccessToken()
  }

  async function login(username: string, password: string): Promise<TokenResponse> {
    return authApi.login(username, password)
  }

  async function register(data: { email: string; password: string; nickname: string; [key: string]: any }): Promise<TokenResponse> {
    return authApi.register(data)
  }

  async function sendEmailCode(email: string): Promise<EmailCodeResponse> {
    return authApi.sendEmailCode(email)
  }

  async function initAccount(params: {
    nickname: string
    llmProvider: string
    llmModel: string
    llmApiKey: string
    llmBaseUrl?: string
  }): Promise<void> {
    await authApi.initAccount(params)
  }

  async function refresh(): Promise<TokenResponse | null> {
    return authApi.refresh()
  }

  async function logout(): Promise<void> {
    await logoutAndClear()
    isLoggedIn.value = false
  }

  return {
    isLoggedIn, checking,
    hasToken,
    login, register, sendEmailCode, initAccount, refresh, logout
  }
})
