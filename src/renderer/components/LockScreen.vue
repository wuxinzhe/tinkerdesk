<template>
  <LockScreenOverlay
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
import { useSessionStore } from '@/renderer/stores/session-store'

const router = useRouter()
const sessionStore = useSessionStore()
const status = ref<'visible' | 'unlocking' | 'error'>('visible')
const errorMessage = ref('')

async function handleUnlock() {
  if (status.value === 'unlocking') return

  status.value = 'unlocking'
  errorMessage.value = ''

  try {
    // 单机客户端：锁屏仅本地体验功能，无服务端认证
    // 解锁后直接进入 Splash，走完整初始化流程
    sessionStore.setLocked(false)
    router.replace({ name: 'splash' })
  } catch {
    status.value = 'error'
    errorMessage.value = '解锁失败，请重试'
  }
}
</script>
