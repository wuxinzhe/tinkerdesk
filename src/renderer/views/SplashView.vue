<template>
  <FullScreenCenterLayout show-version :version-text="'版本 0.1.0'">
    <div class="splash__brand">
      <LogoBrand :faded="step === 'error'" />
    </div>

    <div class="splash__progress">
      <div class="splash__step-list">
        <div v-for="s in steps" :key="s.key" class="splash__step" :class="stepState(s.key)">
          <span class="splash__step-icon">
            <template v-if="s.key === currentStep && step !== 'error'">
              <SaSpinner size="small" />
            </template>
            <template v-else-if="completed(s.key)">✓</template>
            <template v-else-if="step === 'error' && s.key === currentStep">✕</template>
            <template v-else>○</template>
          </span>
          <span class="splash__step-label">{{ s.label }}</span>
        </div>
      </div>

      <p v-if="errorText" class="splash__error">{{ errorText }}</p>

      <div v-if="step === 'error'" class="splash__actions">
        <n-button ghost type="primary" size="medium" @click="start">
          重试
        </n-button>
        <n-button quaternary size="tiny" @click="skipToWorkspace">
          跳过，进入工作台
        </n-button>
      </div>
    </div>
  </FullScreenCenterLayout>
</template>

<script setup lang="ts">
import { FullScreenCenterLayout, LogoBrand, SaSpinner } from '@/renderer/components'
import { markAppInitialized } from '@/renderer/router'
import { useChatStore } from '@/renderer/stores/chat-store'
import { initBackend } from '@/services/backend'
import { authApi } from '@/api/auth-api'
import { toolRegistry } from '@/services/registry/tool-registry'
import { getToolCenterApi } from '@/api/tool-center-api'
import { tokenManager } from '@/services/security/token-manager'
import { useAuthStore } from '@/stores/auth-store'
import { useToolsStore } from '@/stores/tools-store'
import { NButton } from 'naive-ui'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

type StepKey = 'network' | 'auth' | 'registering' | 'env' | 'loading' | 'ready'

const STEP_ORDER: StepKey[] = ['network', 'auth', 'registering', 'env', 'loading', 'ready']

const steps = [
  { key: 'network' as StepKey, label: '正在检查网络...' },
  { key: 'auth' as StepKey, label: '正在验证身份...' },
  { key: 'registering' as StepKey, label: '正在注册工具...' },
  { key: 'env' as StepKey, label: '正在注册环境信息...' },
  { key: 'loading' as StepKey, label: '正在加载配置...' },
  { key: 'ready' as StepKey, label: '准备就绪' },
]

const router = useRouter()
const authStore = useAuthStore()

const currentStep = ref<StepKey>('network')
const step = ref<'running' | 'error' | 'done'>('running')
const errorText = ref('')
let retryCount = 0
const MAX_RETRIES = 3

function completed(key: StepKey): boolean {
  const idx = STEP_ORDER.indexOf(key)
  const cur = STEP_ORDER.indexOf(currentStep.value)
  return idx < cur || (key === 'ready' && step.value === 'done')
}

function stepState(key: StepKey): string {
  if (key === currentStep.value && step.value === 'error') return 'step--error'
  if (completed(key)) return 'step--done'
  if (key === currentStep.value) return 'step--active'
  return 'step--pending'
}

async function start() {
  step.value = 'running'
  errorText.value = ''
  retryCount = 0

  try {
    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

    // ── Step 0: 检查网络 ──
    currentStep.value = 'network'
    if (baseUrl) {
      const ok = await checkNetwork(baseUrl)
      if (!ok) {
        throw new Error('无法连接到服务器，请检查网络连接后重试')
      }
    }
    // ── Step 1: 验证身份 ──
    currentStep.value = 'auth'
    const authed = await verifyAuth()
    if (!authed) {
      tokenManager.clear()
      router.replace({ name: 'login' })
      return
    }
    // ── Step 2: 工具注册 ──
    currentStep.value = 'registering'
    await registerTools()

    // ── Step 3: 注册环境信息 ──
    currentStep.value = 'env'
    await registerEnvironment()

    // ── Step 4: 加载配置 ──
    currentStep.value = 'loading'
    await loadConfiguration(baseUrl)

    // ── Step 5: 检查初始化（服务端确认） ──
    let initialized = false
    try {
      const status = await authApi.getInitStatus()
      initialized = status.initialized
    } catch {
      initialized = false
    }
    if (!initialized) {
      router.replace({ name: 'init-account' })
      return
    }

    // ── 完成 ──
    currentStep.value = 'ready'
    step.value = 'done'
    markAppInitialized()
    await new Promise(r => setTimeout(r, 400))

    // 跳回刷新前所在的页面（如有），否则进入默认 workspace
    const redirectTarget = sessionStorage.getItem('app_redirect_target')
    sessionStorage.removeItem('app_redirect_target')
    if (redirectTarget) {
      router.replace(redirectTarget)
    } else {
      router.replace({ path: '/workspace/chat' })
    }
  } catch (e: any) {
    retryCount++
    if (retryCount >= MAX_RETRIES) {
      step.value = 'error'
      errorText.value = e?.message ?? '初始化失败，请重试'
      return
    }
    // 自动重试
    await new Promise(r => setTimeout(r, 1000))
    return start()
  }
}

// ── 网络检测 ──

async function checkNetwork(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    await fetch(baseUrl + '/', {
      method: 'GET',
      signal: controller.signal
    })
    clearTimeout(timer)
    return true
  } catch {
    return false
  }
}

// ── 身份验证 ──

async function verifyAuth(): Promise<boolean> {
  tokenManager.loadFromStorage()

  if (!tokenManager.hasRefreshToken()) return false

  try {
    const result = await authStore.refresh()
    return result !== null
  } catch {
    return false
  }
}

// ── 工具注册 ──

async function registerTools(): Promise<void> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
  const token = tokenManager.getToken()
  if (!token) throw new Error('未登录')

  // 1. 创建并连接后端（STOMP WebSocket）
  const backend = await initBackend()

  // 注册重连失败回调（3次重连失败后显示错误提示）
  backend.setOnReconnectFailed?.((error: string) => {
    step.value = 'error'
    errorText.value = error
  })

  // 将后端注入 chat-store
  const chatStore = useChatStore()
  chatStore.setBackend(backend)

  const wsBase = baseUrl.replace(/^http/, 'ws')
  const url = `${wsBase}/ws/stomp?token=${encodeURIComponent(token)}`
  await backend.connect(url)

  // 2. 从 ToolCenter 获取本地工具元数据（桌面端走 IPC，Web 端返回空）
  const toolCenterApi = getToolCenterApi()
  const toolCenterState = await toolCenterApi.initialize()
  if (toolCenterState.allAvailable.length > 0) {
    toolRegistry.setDesktopTools(toolCenterState.allAvailable)
  }

  // 3. 获取可用工具定义（getAvailableDefinitions 内部已通过 checkAvailability 过滤）
  const definitions = toolRegistry.getAvailableDefinitions()

  // 4. 注册到本地工具中心
  const toolsStore = useToolsStore()
  toolsStore.setDesktopTools(
    definitions.map(d => ({
      id: d.id,
      name: d.name,
      description: d.description,
      source: 'desktop' as const,
      category: d.category,
      schema: d.schema
    }))
  )

  // 5. 注册到服务端（通过 STOMP → /app/tools/register）
  backend.registerTools(definitions, [])
}

// ── 环境注册 ──

async function registerEnvironment(): Promise<void> {
  const toolCenterApi = getToolCenterApi()
  const env = await toolCenterApi.collectEnv()
  if (!env.os) return // web 环境跳过
  const chatStore = useChatStore()
  const backend = chatStore.getBackend()
  if (!backend) return
  backend.send({ type: 'env_register', ...env })
}

// ── 加载配置（暂为桩）──

async function loadConfiguration(_baseUrl: string): Promise<void> {
  await new Promise(r => setTimeout(r, 300))
}

// ── 跳过 ──

function skipToWorkspace() {
  markAppInitialized()
  router.replace({ path: '/workspace/chat' })
}

onMounted(() => {
  // 检查是否有 token，没有则停留在当前页
  // verifyAuth 会处理 refresh（有 refresh_token 就续期，没有就去 login）
  start()
})
</script>

<style scoped>
.splash__brand {
  margin-bottom: 12px;
}

.splash__progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.splash__step-list {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.splash__step {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--sa-fs-body);
  color: var(--sa-text-tertiary);
  transition: color 0.2s;
}

.splash__step.step--active {
  color: var(--sa-text-primary);
}

.splash__step.step--done {
  color: var(--sa-success);
}

.splash__step.step--error {
  color: var(--sa-destructive);
}

.splash__step-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  font-size: 14px;
}

.splash__step-label {
  line-height: 1.4;
}

.splash__error {
  font-size: var(--sa-fs-body);
  color: var(--sa-destructive);
  margin: 8px 0 0;
  text-align: center;
}

.splash__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}
</style>
