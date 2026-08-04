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
import { getToolCenterApi } from '@/api/tool-center-api'
import { toolRegistry } from '@/services/registry/tool-registry'
import { useToolsStore } from '@/stores/tools-store'
import { NButton } from 'naive-ui'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

type StepKey = 'network' | 'registering' | 'loading' | 'ready'

const STEP_ORDER: StepKey[] = ['network', 'registering', 'loading', 'ready']

const steps = [
  { key: 'network' as StepKey, label: '正在检查环境...' },
  { key: 'registering' as StepKey, label: '正在注册工具...' },
  { key: 'loading' as StepKey, label: '正在加载配置...' },
  { key: 'ready' as StepKey, label: '准备就绪' },
]

const router = useRouter()

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
    // ── Step 0: 环境检查（本地工具可用性探测） ──
    currentStep.value = 'network'
    await checkEnvironment()

    // ── Step 1: 工具注册（本地 ToolCenter，不连 WebSocket） ──
    currentStep.value = 'registering'
    await registerTools()

    // ── Step 2: 加载配置 ──
    currentStep.value = 'loading'
    await loadConfiguration()

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

// ── 环境检查（本地探测，不依赖后端） ──

async function checkEnvironment(): Promise<void> {
  // 本地应用：探测 ToolCenter 是否可用（桌面端 IPC，Web 端返回空）
  const toolCenterApi = getToolCenterApi()
  try {
    await toolCenterApi.initialize()
  } catch {
    // 桌面端 ToolCenter 不可用不阻塞启动，工具注册步骤会降级
  }
}

// ── 工具注册（本地元数据，不连接 WebSocket） ──

async function registerTools(): Promise<void> {
  // 1. 从 ToolCenter 获取本地工具元数据（桌面端走 IPC，Web 端返回空）
  const toolCenterApi = getToolCenterApi()
  const toolCenterState = await toolCenterApi.initialize()
  if (toolCenterState.allAvailable.length > 0) {
    toolRegistry.setDesktopTools(toolCenterState.allAvailable)
  }

  // 2. 获取可用工具定义（getAvailableDefinitions 内部已通过 checkAvailability 过滤）
  const definitions = toolRegistry.getAvailableDefinitions()

  // 3. 注入本地工具 store（渲染层展示用）
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
}

// ── 加载配置（暂为桩） ──

async function loadConfiguration(): Promise<void> {
  await new Promise(r => setTimeout(r, 300))
}

// ── 跳过 ──

function skipToWorkspace() {
  markAppInitialized()
  router.replace({ path: '/workspace/chat' })
}

onMounted(() => {
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
