<template>
  <div id="sa-app" class="app-shell">
    <!-- 自定义标题栏（仅 Electron 桌面端） -->
    <TitleBar v-if="isDesktop" />

    <!-- Page transitions with route-based animation names -->
    <router-view v-slot="{ Component, route }">
      <transition
        :name="route.meta.transition || 'fade'"
        mode="out-in"
        @before-leave="onTransitionStart"
        @after-enter="onTransitionEnd"
      >
        <component :is="Component" :key="route.matched[0]?.path || route.path" />
      </transition>
    </router-view>

    <!-- LockScreen overlay (not a route, rendered on top of everything) -->
    <LockScreen v-if="isLocked" />

    <!-- 错误上报 consent 弹窗 -->
    <n-modal
      v-model:show="showConsent"
      :mask-closable="false"
      preset="dialog"
      title="错误报告"
      content=""
      positive-text="同意并上报"
      negative-text="不同意"
      @positive-click="onConsent(true)"
      @negative-click="onConsent(false)"
    >
      <p class="consent__text">
        应用发生了一个错误（{{ consentErrorSummary }}）。
        是否允许将错误信息发送给开发团队以帮助改进？
      </p>
      <p class="consent__note">您可以随时在设置中更改此选项。</p>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useSessionStore } from '@/stores/session-store'
import LockScreen from '@/renderer/components/LockScreen.vue'
import TitleBar from '@/renderer/components/workspace/TitleBar.vue'
import { setupAppHost, needsConsent, consentErrorSummary, resolveConsent } from '@/renderer/utils/app-init'
import { NModal } from 'naive-ui'

// ── Application Host 初始化 ──

setupAppHost()

// ── 桌面端检测 ──

const isDesktop = computed(() => typeof window !== 'undefined' && 'api' in window)

// ── Consent 弹窗 ──

const showConsent = ref(false)

watch(needsConsent, (v) => {
  showConsent.value = v
})

function onConsent(agreed: boolean) {
  resolveConsent(agreed)
}

// ── 锁屏 ──

const sessionStore = useSessionStore()
const isLocked = computed(() => sessionStore.isLocked)

function enterLockScreen() {
  sessionStore.setLocked(true)
}

// ── 快捷键：Ctrl+Shift+L 触发锁屏 ──

function onKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
    e.preventDefault()
    enterLockScreen()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// ── 过渡动画 ──

function onTransitionStart() {
  document.documentElement.classList.add('sa-transitioning')
  document.body.classList.add('sa-transitioning')
}

function onTransitionEnd() {
  document.documentElement.classList.remove('sa-transitioning')
  document.body.classList.remove('sa-transitioning')
}
</script>

<style>
/* ── App Shell：全屏 flex 列容器 ── */
.app-shell {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Prevent body scroll during page transitions ── */
html.sa-transitioning,
body.sa-transitioning {
  overflow: hidden;
}

/* ── Lock screen body guard ── */
body.locked {
  overflow: hidden;
}

/* ── Consent dialog ── */
.consent__text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--sa-text-primary);
  margin: 0 0 8px;
}

.consent__note {
  font-size: 12px;
  color: var(--sa-text-tertiary);
  margin: 0;
}
</style>
