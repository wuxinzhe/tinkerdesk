<script setup lang="ts">
/**
 * ConfirmModal.vue — 全局确认弹窗（Apple HIG 风格）
 *
 * 用法（命令式，无需模板内引用）：
 *   import { confirm } from '@/renderer/api/confirm'
 *   const ok = await confirm({ title: '卸载插件？', message: '…', confirmText: '卸载', destructive: true })
 *   if (ok) { … }
 *
 * 机制：confirm() dispatch window 'global-confirm' 事件（带 resolve 回调）；
 * 本组件（挂载于 App.vue）监听并渲染；确认/取消/遮罩/Esc 时 resolve。
 */
import { ref, onMounted, onUnmounted } from 'vue'

interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  /** 确认按钮红色（危险操作） */
  destructive?: boolean
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (value: boolean) => void
}

const request = ref<ConfirmRequest | null>(null)

function handleEvent(e: Event): void {
  const detail = (e as CustomEvent<ConfirmRequest>).detail
  if (detail) request.value = detail
}

function resolveWith(value: boolean): void {
  const r = request.value
  request.value = null
  r?.resolve(value)
}

onMounted(() => window.addEventListener('global-confirm', handleEvent))
onUnmounted(() => window.removeEventListener('global-confirm', handleEvent))
</script>

<template>
  <Teleport to="body">
    <Transition name="sa-modal">
      <div
        v-if="request"
        class="sa-modal-mask"
        @click.self="resolveWith(false)"
        @keydown.esc="resolveWith(false)"
      >
        <div class="sa-modal" role="alertdialog" aria-modal="true">
          <div class="sa-modal__icon" :class="{ 'is-danger': request.destructive }" aria-hidden="true">
            <svg v-if="request.destructive" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </div>
          <h2 class="sa-modal__title">{{ request.title }}</h2>
          <p v-if="request.message" class="sa-modal__message">{{ request.message }}</p>
          <div class="sa-modal__actions">
            <button class="sa-modal__btn" @click="resolveWith(false)">
              {{ request.cancelText ?? '取消' }}
            </button>
            <button class="sa-modal__btn" :class="{ 'sa-modal__btn--destructive': request.destructive }" @click="resolveWith(true)">
              {{ request.confirmText ?? '确定' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sa-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(20px) saturate(1.2);
  -webkit-backdrop-filter: blur(20px) saturate(1.2);
}

.sa-modal {
  width: 320px;
  padding: 24px;
  background: var(--tk-bg-elevated);
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}

.sa-modal__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-bottom: 14px;
  border-radius: 50%;
  color: var(--tk-accent);
  background: rgba(0, 122, 255, 0.1);
}

.sa-modal__icon.is-danger {
  color: var(--tk-danger);
  background: rgba(255, 59, 48, 0.1);
}

.sa-modal__title {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--tk-text-primary);
}

.sa-modal__message {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--tk-text-secondary);
}

.sa-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.sa-modal__btn {
  min-width: 64px;
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  color: var(--tk-accent);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s ease-in-out;
}

.sa-modal__btn:hover {
  background: var(--tk-bg-hover);
}

.sa-modal__btn--destructive {
  color: #ffffff;
  background: var(--tk-danger);
}

.sa-modal__btn--destructive:hover {
  background: #e03228;
}

/* 弹窗动效（fade + scale，尊重 reduced-motion） */
.sa-modal-enter-active,
.sa-modal-leave-active {
  transition: opacity 0.2s ease-in-out;
}

.sa-modal-enter-active .sa-modal,
.sa-modal-leave-active .sa-modal {
  transition: transform 0.2s ease-in-out;
}

.sa-modal-enter-from,
.sa-modal-leave-to {
  opacity: 0;
}

.sa-modal-enter-from .sa-modal,
.sa-modal-leave-to .sa-modal {
  transform: scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .sa-modal-enter-active,
  .sa-modal-leave-active,
  .sa-modal-enter-active .sa-modal,
  .sa-modal-leave-active .sa-modal {
    transition: none;
  }
}
</style>
