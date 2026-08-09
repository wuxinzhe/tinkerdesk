<template>
  <!-- 挂载/卸载动画由外层 App.vue <Transition name="lock"> 统一控制（去掉 Teleport 让组件根成为真实 DOM） -->
  <div class="lock-screen-overlay" @click.self="() => {}">
    <div class="lock-screen-overlay__content">
      <!-- Logo -->
      <svg
        class="lock-screen-overlay__logo"
        viewBox="0 0 32 32"
        width="64"
        height="64"
      >
        <circle cx="16" cy="16" r="14" fill="var(--tk-accent)" opacity="0.08" />
        <path d="M10 22V10l8 6-8 6Z" fill="var(--tk-accent)" />
      </svg>

      <h2 class="lock-screen-overlay__title">
        您已离开一段时间
      </h2>
      <p class="lock-screen-overlay__subtitle">
        智能助手随时待命
      </p>

      <!-- Unlock button -->
      <button
        class="lock-screen-overlay__btn"
        :disabled="status === 'unlocking'"
        @click="$emit('unlock')"
      >
        <span v-if="status === 'unlocking'" class="lock-screen-overlay__spinner"></span>
        <span v-else>点击解锁</span>
      </button>

      <p v-if="status === 'error' && errorMessage" class="lock-screen-overlay__error">
        {{ errorMessage }}
      </p>
    </div>

    <p class="lock-screen-overlay__version">
      {{ versionText }}
    </p>
  </div>
</template>

<script setup lang="ts">
export type LockStatus = 'visible' | 'unlocking' | 'error'

interface LockScreenOverlayProps {
  status?: LockStatus
  errorMessage?: string
  versionText?: string
}

withDefaults(defineProps<LockScreenOverlayProps>(), {
  status: 'visible',
  errorMessage: '',
  versionText: '',
})

defineEmits<{
  unlock: []
}>()
</script>

<style scoped>
.lock-screen-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--tk-z-lock-screen);
  background: var(--tk-overlay);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}

.lock-screen-overlay__content {
  text-align: center;
}

.lock-screen-overlay__logo {
  display: block;
  margin: 0 auto 24px;
  opacity: 0.6;
}

.lock-screen-overlay__title {
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
  margin: 0 0 4px;
}

.lock-screen-overlay__subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 40px;
}

.lock-screen-overlay__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 32px;
  font-size: 14px;
  font-weight: 500;
  font-family: var(--tk-font-stack);
  color: #ffffff;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: var(--tk-radius-md);
  cursor: pointer;
  transition: background var(--tk-duration-fast) ease;
}

.lock-screen-overlay__btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.lock-screen-overlay__btn:active:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
}

.lock-screen-overlay__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.lock-screen-overlay__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: sa-spin 0.6s linear infinite;
}

.lock-screen-overlay__error {
  font-size: 12px;
  color: #ff453a;
  margin-top: 16px;
}

.lock-screen-overlay__version {
  position: fixed;
  bottom: 24px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: var(--tk-fs-caption);
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
}
</style>
