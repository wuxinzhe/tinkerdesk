<template>
  <FullScreenCenterLayout show-version :version-text="'版本 0.1.0'">
    <div class="splash">
      <!-- 科技感背景光晕（左上蓝 + 右下青，低透明度） -->
      <div class="splash__glow splash__glow--top" aria-hidden="true" />
      <div class="splash__glow splash__glow--bottom" aria-hidden="true" />
      <!-- 极淡网格 -->
      <div class="splash__grid" aria-hidden="true" />

      <div class="splash__brand">
        <LogoBrand :faded="step === 'error'" />
      </div>

      <!-- 玻璃进度卡片 -->
      <div class="splash__card">
        <div class="splash__step-list">
          <div v-for="s in steps" :key="s.key" class="splash__step" :class="stepState(s.key)">
            <span class="splash__step-icon">
              <template v-if="s.key === currentStep && step !== 'error'">
                <span class="splash__pulse" />
              </template>
              <template v-else-if="completed(s.key)">
                <svg class="splash__check" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
                  <path d="M2 6.5L4.5 9L10 3" fill="none" stroke="currentColor"
                    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </template>
              <template v-else-if="step === 'error' && s.key === currentStep">
                <svg class="splash__cross" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
                  <path d="M3 3l6 6M9 3L3 9" fill="none" stroke="currentColor"
                    stroke-width="1.8" stroke-linecap="round" />
                </svg>
              </template>
              <template v-else>
                <span class="splash__dot" />
              </template>
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
    </div>
  </FullScreenCenterLayout>
</template>

<script setup lang="ts">
import { FullScreenCenterLayout, LogoBrand } from '@/renderer/components'
import { markAppInitialized } from '@/renderer/router'
import { getToolCenterApi } from '@/renderer/api/tool-center-api'
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

    // ── Step 1: 工具注册（本地工具清单由 AgentToolsView 打开时经 IPC 拉取，无需预注册） ──
    currentStep.value = 'registering'
    await new Promise(r => setTimeout(r, 100))

    // ── Step 2: 加载配置 ──
    currentStep.value = 'loading'
    await loadConfiguration()

    // ── Step 3: 检查初始化──
    let initialized = false
    try {
      const status = await window.api.account.initStatus()
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
  } catch (e) {
    retryCount++
    if (retryCount >= MAX_RETRIES) {
      step.value = 'error'
      errorText.value = (e as Error).message ?? '初始化失败，请重试'
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
/* ── Apple HIG：清晰层级 + 8pt 网格 + 玻璃材质；科技感：光晕/脉冲/细线 ── */

.splash {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sa-space-5, 20px);
}

/* ── 背景光晕（低透明度径向渐变） ── */
.splash__glow {
  position: fixed;
  border-radius: 50%;
  filter: blur(72px);
  pointer-events: none;
  z-index: 0;
}

.splash__glow--top {
  top: -140px;
  left: -100px;
  width: 420px;
  height: 420px;
  background: radial-gradient(circle, rgba(0, 122, 255, 0.14), transparent 70%);
}

.splash__glow--bottom {
  bottom: -160px;
  right: -120px;
  width: 460px;
  height: 460px;
  background: radial-gradient(circle, rgba(48, 173, 179, 0.12), transparent 70%);
}

/* ── 极淡网格（科技感纹理，非常克制） ── */
.splash__grid {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background-image:
    linear-gradient(rgba(0, 0, 0, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 0, 0, 0.025) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 60% 50% at 50% 45%, black 30%, transparent 100%);
  -webkit-mask-image: radial-gradient(ellipse 60% 50% at 50% 45%, black 30%, transparent 100%);
}

/* ── Logo：白底圆角卡片 + 柔和阴影（发光感） ── */
.splash__brand {
  position: relative;
  z-index: 1;
  padding: 10px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: var(--sa-radius-lg, 12px);
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 3px rgba(0, 0, 0, 0.04);
}

/* ── 玻璃进度卡片 ── */
.splash__card {
  position: relative;
  z-index: 1;
  min-width: 240px;
  padding: var(--sa-space-5, 20px) var(--sa-space-6, 24px);
  background: var(--sa-bg-glass, rgba(255, 255, 255, 0.72));
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 20px;
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.08),
    0 1px 2px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.2s ease-in-out;
}

.splash__step-list {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sa-space-4, 16px);
}

/* ── 步骤项（连接线在图标左侧纵向贯穿） ── */
.splash__step {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--sa-space-3, 12px);
  font-size: var(--sa-fs-body, 13px);
  color: var(--sa-text-tertiary, #aeaeb2);
  transition: color 0.2s ease-in-out;
}

.splash__step:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 9px;
  top: 22px;
  width: 1px;
  height: 14px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.1), transparent);
}

.splash__step.step--active {
  color: var(--sa-text-primary, #1d1d1f);
}

.splash__step.step--done {
  color: var(--sa-success, #34c759);
}

.splash__step.step--error {
  color: var(--sa-destructive, #ff3b30);
}

/* ── 图标区 ── */
.splash__step-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

/* pending：灰点 */
.splash__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--sa-text-quaternary, #c7c7cc);
  transition: background-color 0.2s ease-in-out;
}

/* active：蓝点 + 呼吸光晕（科技感脉冲） */
.splash__pulse {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--sa-accent, #007aff);
  box-shadow: 0 0 0 0 rgba(0, 122, 255, 0.35);
  animation: splash-pulse 1.6s ease-out infinite;
}

@keyframes splash-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(0, 122, 255, 0.35);
  }
  70% {
    box-shadow: 0 0 0 7px rgba(0, 122, 255, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(0, 122, 255, 0);
  }
}

/* done：绿色对勾 */
.splash__check {
  color: var(--sa-success, #34c759);
}

/* error：红色叉 */
.splash__cross {
  color: var(--sa-destructive, #ff3b30);
}

.splash__step-label {
  line-height: 1.4;
}

/* ── 错误提示 ── */
.splash__error {
  font-size: var(--sa-fs-body, 13px);
  color: var(--sa-destructive, #ff3b30);
  margin: var(--sa-space-3, 12px) 0 0;
  text-align: center;
}

.splash__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sa-space-3, 12px);
  margin-top: var(--sa-space-2, 8px);
}

/* ── 动效降级 ── */
@media (prefers-reduced-motion: reduce) {
  .splash__pulse {
    animation: none;
  }
  .splash__card {
    transition: none;
  }
}
</style>
