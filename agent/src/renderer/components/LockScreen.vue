<template>
  <LockScreenOverlay
    :visible="true"
    :status="status"
    :error-message="errorMessage"
    version-text="版本 0.1.0"
    @unlock="handleUnlock"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { LockScreenOverlay } from '@/renderer/components'
import { useSessionStore } from '@/stores/session-store'
import { authApi } from '@/api/auth-api'
import { tokenManager } from '@/services/security/token-manager'

const router = useRouter()
const sessionStore = useSessionStore()
const status = ref<'visible' | 'unlocking' | 'error'>('visible')
const errorMessage = ref('')
let retryCount = 0
const MAX_RETRIES = 3

async function handleUnlock() {
  if (status.value === 'unlocking') return

  status.value = 'unlocking'
  errorMessage.value = ''

  try {
    if (!tokenManager.hasRefreshToken()) {
      // 没有 refresh token → 直接跳登录
      sessionStore.setLocked(false)
      router.replace({ name: 'login' })
      return
    }

    const result = await authApi.refresh()

    if (result) {
      retryCount = 0
      sessionStore.setLocked(false)
      // 跳转 Splash，重新走完整验证流程
      router.replace({ name: 'splash' })
      return
    }

    // refresh 失败 → token 完全失效
    sessionStore.setLocked(false)
    tokenManager.clear()
    sessionStorage.removeItem('app_initialized')
    window.location.hash = '#/splash'
  } catch {
    retryCount++
    if (retryCount >= MAX_RETRIES) {
      status.value = 'error'
      errorMessage.value = '解锁失败，请重试'
    } else {
      // 自动重试
      status.value = 'visible'
    }
  }
}
</script>
