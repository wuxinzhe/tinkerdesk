<template>
  <FullScreenCardLayout>
    <template #brand>
      <BannerBrand />
    </template>

    <template #heading>初始化设置</template>
    <template #subtitle>分步配置您的 AI 助手</template>

    <template #form>
      <!-- Apple HIG 节点式步骤进度条 -->
      <ol class="init-stepper" aria-label="初始化步骤">
        <li
          v-for="(s, i) in stepMeta"
          :key="s.key"
          class="init-step"
          :class="{
            'init-step--done': isStepDone(i),
            'init-step--active': currentStep === i,
            'init-step--pending': !isStepDone(i) && currentStep !== i
          }"
        >
          <div class="init-step__node">
            <svg
              v-if="isStepDone(i)"
              class="init-step__check"
              viewBox="0 0 12 12"
              width="12"
              height="12"
              aria-hidden="true"
            >
              <path
                d="M2 6.5L4.5 9L10 3"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span v-else class="init-step__num">{{ i + 1 }}</span>
          </div>
          <div class="init-step__label">
            <span class="init-step__title">{{ s.title }}</span>
          </div>
        </li>
      </ol>

      <!-- 过渡动画 + 4 步表单（transition 包裹 v-if/v-else-if 链） -->
      <transition name="init-fade" mode="out-in">
        <div v-if="transitioning" key="transition" class="init__transition">
          <div class="init__transition-spinner" />
          <p class="init__transition-text">{{ transitionText }}</p>
        </div>

        <!-- Step 1：创建默认 Agent -->
        <n-form v-else-if="currentStep === 0" key="step1" @submit.prevent="submitStep1">
          <n-form-item
            label="Agent 昵称"
            :feedback="errors.nickname"
            :validation-status="errors.nickname ? 'error' : undefined"
          >
            <n-input
              v-model:value="form.nickname"
              placeholder="给默认 Agent 起个名字"
              :disabled="loading"
            />
          </n-form-item>
          <n-button type="primary" attr-type="submit" block size="large" :loading="loading">
            创建默认 Agent
          </n-button>
        </n-form>

        <!-- Step 2：AgentConfig 完整配置（字段级：只显示缺失项，可滚动） -->
        <n-form v-else-if="currentStep === 1" key="step2" @submit.prevent="submitStep2">
          <p class="init__desc">
            检测到以下配置项尚未设置，补齐即可；未列出的参数已配置，不会被覆盖。
          </p>
          <!-- Step 2 字段（滚动由外层 layout-card__form 统一负责，隐藏滚动条） -->
          <n-form-item
            v-for="f in step2MissingFields"
            :key="f.key"
            :label="f.label"
          >
            <n-input-number
              v-if="f.type === 'number'"
              v-model:value="step2Form[f.key]"
              :disabled="loading"
              :placeholder="f.placeholder"
              :step="f.step"
              style="width: 100%"
            />
            <n-input
              v-else-if="f.type === 'text'"
              v-model:value="step2Form[f.key] as string"
              type="textarea"
              :disabled="loading"
              :placeholder="f.placeholder"
              :autosize="{ minRows: 2, maxRows: 5 }"
            />
            <n-switch
              v-else
              v-model:value="step2Form[f.key]"
              :disabled="loading"
            />
          </n-form-item>
          <n-button type="primary" attr-type="submit" block size="large" :loading="loading">
            保存配置
          </n-button>
        </n-form>

      <!-- Step 3：含 API Key 的模型 -->
      <n-form v-else-if="currentStep === 2" key="step3" @submit.prevent="submitStep3">
        <p v-if="step3Existing.length > 0" class="init__desc">
          检测到已有模型，已为你回显配置，只需填入 API Key 即可。
        </p>
        <n-form-item
          label="AI 提供商"
          :feedback="errors.provider"
          :validation-status="errors.provider ? 'error' : undefined"
        >
          <n-select
            v-model:value="form.provider"
            :options="providerOptions"
            placeholder="选择提供商"
            :disabled="loading || providersLoading"
            :loading="providersLoading"
            @update:value="onProviderChange"
          />
        </n-form-item>

        <n-form-item
          label="API Key"
          :feedback="errors.apiKey"
          :validation-status="errors.apiKey ? 'error' : undefined"
        >
          <div class="init__api-key-row">
            <n-input
              v-model:value="form.apiKey"
              type="password"
              placeholder="sk-..."
              show-password-toggle
              :disabled="loading || !form.provider"
              style="flex: 1"
              @update:value="onApiKeyChange"
            />
            <n-button
              :loading="testingConnection"
              :disabled="!form.apiKey.trim() || !form.provider || testingConnection || connectionTested"
              :type="connectionTested ? 'success' : 'default'"
              @click="testConnection"
            >
              {{ connectionTested ? '测试成功' : '测试连接' }}
            </n-button>
          </div>
        </n-form-item>

        <n-form-item
          label="模型"
          :feedback="errors.model"
          :validation-status="errors.model ? 'error' : undefined"
        >
          <n-select
            v-model:value="form.model"
            :options="modelOptions"
            placeholder="请先测试连接以获取可用模型"
            :disabled="!connectionTested || loading"
            :loading="testingConnection"
          />
        </n-form-item>

        <n-form-item label="API 地址（可选）">
          <n-input
            v-model:value="form.baseUrl"
            :placeholder="selectedProviderBaseUrl || '留空则使用提供商默认地址'"
            :disabled="loading"
          />
        </n-form-item>

        <n-button
          type="primary"
          attr-type="submit"
          block
          size="large"
          :loading="loading"
          :disabled="!canSubmitStep3"
        >
          保存模型
        </n-button>
      </n-form>

      <!-- Step 4：绑定主聊天场景 -->
      <n-form v-else-if="currentStep === 3" key="step4" @submit.prevent="submitStep4">
        <n-form-item
          label="选择模型绑定到主聊天场景"
          :feedback="errors.model"
          :validation-status="errors.model ? 'error' : undefined"
        >
          <n-select
            v-model:value="form.bindModelId"
            :options="bindModelOptions"
            placeholder="选择已保存的模型"
            :disabled="loading"
          />
        </n-form-item>
        <n-button
          type="primary"
          attr-type="submit"
          block
          size="large"
          :loading="loading"
          :disabled="!form.bindModelId"
        >
          完成绑定
        </n-button>
      </n-form>
      </transition>
    </template>
  </FullScreenCardLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NForm, NFormItem, NInput, NSelect } from 'naive-ui'
import BannerBrand from '@/renderer/components/BannerBrand.vue'
import FullScreenCardLayout from '@/renderer/components/FullScreenCardLayout.vue'
import type { CustomModelInfo, InitAccountParams, InitStepStatusResult, ModelInfo, SystemProvider } from '@/renderer/api/types'
import { modelsApi } from '@/renderer/api/models-api'

const router = useRouter()

/** 4 步元数据（对应后端 checkInitStatus 顺序） */
const stepMeta = [
  { key: 'default_agent', title: '创建 Agent', description: '创建默认 Agent' },
  { key: 'agent_config', title: '配置参数', description: '补齐缺失参数' },
  { key: 'provider_token', title: '接入 AI', description: '配置 API Key 与模型' },
  { key: 'scene_model_configured', title: '分配模型', description: '绑定主聊天场景' },
]

/** Step2 配置字段定义（对齐 AgentConfig：数字/布尔/文本） */
const step2Fields: Array<{ key: string; label: string; type: 'number' | 'boolean' | 'text'; placeholder?: string; step?: number }> = [
  { key: 'maxIterations', label: '最大迭代次数', type: 'number', placeholder: '90' },
  { key: 'toolExecutionTimeout', label: '工具执行超时（秒）', type: 'number', placeholder: '120' },
  { key: 'maxConversations', label: '最大会话数', type: 'number', placeholder: '5' },
  { key: 'memoryMaxChars', label: '记忆容量（字符）', type: 'number', placeholder: '2200' },
  { key: 'userMaxChars', label: '用户输入上限（字符）', type: 'number', placeholder: '1375' },
  { key: 'thresholdPercent', label: '压缩阈值', type: 'number', placeholder: '0.5', step: 0.1 },
  { key: 'tailRatio', label: '尾部保留比例', type: 'number', placeholder: '0.2', step: 0.1 },
  { key: 'warningsEnabled', label: '开启预警', type: 'boolean' },
  { key: 'hardStopEnabled', label: '开启硬停止', type: 'boolean' },
  { key: 'exactFailureWarnAfter', label: '精确失败预警次数', type: 'number', placeholder: '2' },
  { key: 'sameToolFailureWarnAfter', label: '同工具失败预警次数', type: 'number', placeholder: '3' },
  { key: 'noProgressWarnAfter', label: '无进展预警次数', type: 'number', placeholder: '2' },
  { key: 'exactFailureBlockAfter', label: '精确失败封锁次数', type: 'number', placeholder: '5' },
  { key: 'sameToolFailureHaltAfter', label: '同工具失败停机次数', type: 'number', placeholder: '8' },
  { key: 'noProgressBlockAfter', label: '无进展封锁次数', type: 'number', placeholder: '5' },
  { key: 'agentSoulPrompt', label: '灵魂提示词', type: 'text', placeholder: 'Agent 的基础人设/系统提示词（可留空使用默认）' },
]

const currentStep = ref(0)
const transitioning = ref(false)
const transitionText = ref('')
const loading = ref(false)

/** Step2 表单（数字/文本字段存 string|number，布尔存 boolean） */
const step2Form = reactive<Record<string, string | number | boolean>>({})
for (const f of step2Fields) {
  step2Form[f.key] = f.type === 'boolean' ? false : ''
}
/** Step2 缺失字段（后端字段级检查返回） */
const step2Missing = ref<string[]>([])
/** Step3 回显的已有模型（无 key 模型，补 key 场景） */
const step3Existing = ref<CustomModelInfo[]>([])

/** 步骤是否已完成（位于当前步骤之前 = 已通过检查） */
function isStepDone(i: number): boolean {
  return i < currentStep.value
}

const form = reactive({
  nickname: '',
  provider: '',
  apiKey: '',
  model: '',
  baseUrl: '',
  bindModelId: ''
})

const errors = reactive({
  nickname: '',
  provider: '',
  apiKey: '',
  model: ''
})

// ── 数据源 ──

const providers = ref<SystemProvider[]>([])
const providersLoading = ref(false)
const testingConnection = ref(false)
const connectionTested = ref(false)
const availableModels = ref<ModelInfo[]>([])
const savedModels = ref<CustomModelInfo[]>([])

const providerOptions = computed(() =>
  providers.value.map((p) => ({ label: p.name, value: p.id }))
)

const selectedProvider = computed(() =>
  providers.value.find((p) => p.id === form.provider)
)

const selectedProviderBaseUrl = computed(() =>
  selectedProvider.value?.baseUrl || ''
)

const modelOptions = computed(() =>
  connectionTested.value
    ? availableModels.value.map((m) => ({ label: m.id, value: m.id }))
    : []
)

const bindModelOptions = computed(() =>
  savedModels.value.map((m) => ({ label: `${m.alias} (${m.modelName})`, value: m.id }))
)

const canSubmitStep3 = computed(() =>
  form.provider !== '' && form.apiKey.trim() !== '' && form.model.trim() !== ''
)

// ── 流程控制 ──

/** 过渡动画（≥2s），结束后执行回调 */
async function runTransition(text: string, done?: () => void): Promise<void> {
  transitioning.value = true
  transitionText.value = text
  await new Promise((r) => setTimeout(r, 2000))
  transitioning.value = false
  done?.()
}

/** 重新执行 4 项检查：定位第一个未通过步骤 → 分步检查（已配置自动跳）→ 显示表单；全过 → workspace */
async function runChecks(): Promise<void> {
  try {
    const status = await window.api.account.initStatus()
    const firstFail = status.checks.findIndex((c) => !c.passed)
    if (firstFail === -1) {
      // 全部通过 → 过渡动画 → 进入 workspace
      await runTransition('初始化完成，正在进入工作区…', () => {
        router.replace({ path: '/workspace/chat' })
      })
      return
    }
    // 定位到未通过步骤前先做 2s 检查动画
    await runTransition(`正在检查：${stepMeta[firstFail].title}…`)
    // 进入该步骤：分步检查（已配置自动进入下一项）
    await enterStep(firstFail)
  } catch {
    // 错误提示由 preload inv 拦截统一派发（GlobalTipToast）
  }
}

/**
 * 进入指定步骤（除 step1 外）：
 * 先检查该步骤配置——已配置自动进入下一项；未配置先读取已有配置回显（避免覆盖、避免反复填写）。
 */
async function enterStep(target: number): Promise<void> {
  // 全部完成 → 进入工作区
  if (target >= 4) {
    await runTransition('初始化完成，正在进入工作区…', () => {
      router.replace({ path: '/workspace/chat' })
    })
    return
  }
  // step2/3/4（target+1 = 1-based 步骤号）：先检查该步骤配置
  if (target >= 1) {
    const status = await window.api.account.initStepStatus(target + 1)
    if (status.configured) {
      await runTransition(`第 ${target + 1} 步已配置，自动进入下一项…`)
      await enterStep(target + 1)
      return
    }
    applyStepEcho(target + 1, status)
  }
  currentStep.value = target
}

/** 回显已有配置：step2 = AgentConfig 字段；step3 = 已有模型（补 key 场景） */
function applyStepEcho(step: number, status: InitStepStatusResult): void {
  if (step === 2) {
    step2Missing.value = status.missingFields
    const cfg = (status.existing ?? null) as Record<string, unknown> | null
    if (cfg) {
      for (const f of step2Fields) {
        const v = cfg[f.key]
        if (v !== null && v !== undefined) {
          step2Form[f.key] = f.type === 'boolean' ? !!v : String(v)
        }
      }
    }
  } else if (step === 3) {
    step3Existing.value = (status.existing as CustomModelInfo[] | null) ?? []
    // 回显第一个已有模型（用户只需补 API Key）
    const m = step3Existing.value.find((x) => !x.apiKey) ?? step3Existing.value[0]
    if (m) {
      form.provider = m.providerId
      form.model = m.modelName
      form.baseUrl = m.baseUrl ?? ''
    }
  } else if (step === 4) {
    // 重新加载模型列表（Step3 可能刚创建模型，onMounted 的旧数据不可用）
    void loadSavedModels()
  }
}

/** 该字段是否为缺失项（missingFields 驱动；'__no_config__' = 无配置行 → 全部视为缺失） */
function isStep2Missing(key: string): boolean {
  return step2Missing.value.includes('__no_config__') || step2Missing.value.includes(key)
}

/** 只显示需要配置的缺失字段（已有值不展示，避免反复填写） */
const step2MissingFields = computed(() => step2Fields.filter((f) => isStep2Missing(f.key)))

/** 保存成功后：过渡动画 → 重新检查定位下一步 */
async function afterStepSaved(): Promise<void> {
  await runTransition('保存成功，正在检查下一步…', () => {
    void runChecks()
  })
}

// ── Step 1：创建默认 Agent ──

async function submitStep1() {
  if (loading.value) return
  if (!form.nickname.trim()) {
    errors.nickname = '请输入昵称'
    return
  }
  errors.nickname = ''
  loading.value = true
  try {
    await window.api.account.initStep1({ displayName: form.nickname.trim() })
    await afterStepSaved()
  } catch {
    // 错误提示由 preload inv 拦截统一派发（GlobalTipToast）
  } finally {
    loading.value = false
  }
}

// ── Step 2：AgentConfig 合并保存 ──

async function submitStep2() {
  if (loading.value) return
  loading.value = true
  try {
    // 只提交用户填写的字段（缺失项）；已有值由后端合并保留，避免覆盖
    const config: Record<string, unknown> = {}
    for (const f of step2Fields) {
      const v = step2Form[f.key]
      if (v === null || v === undefined || v === '') continue
      config[f.key] = f.type === 'number' ? Number(v) : (f.type === 'boolean' ? !!v : String(v))
    }
    await window.api.account.initStep2(Object.keys(config).length > 0 ? config : undefined)
    await afterStepSaved()
  } catch {
    // 错误提示由 preload inv 拦截统一派发（GlobalTipToast）
  } finally {
    loading.value = false
  }
}

// ── Step 3：创建含 API Key 的模型 ──

function onProviderChange() {
  form.apiKey = ''
  form.model = ''
  connectionTested.value = false
  availableModels.value = []
  errors.apiKey = ''
  errors.model = ''
}

/** API Key 被修改 → 解除测试成功状态（key 变了需重新测试），清空可用模型 */
function onApiKeyChange() {
  connectionTested.value = false
  if (availableModels.value.length > 0) {
    availableModels.value = []
    form.model = ''
  }
  errors.apiKey = ''
}

async function testConnection() {
  if (!form.provider || !form.apiKey.trim()) return
  testingConnection.value = true
  connectionTested.value = false
  form.model = ''
  errors.model = ''
  try {
    const baseUrl = form.baseUrl.trim() || selectedProviderBaseUrl.value
    const modelsResult = await modelsApi.fetchModels(form.provider, form.apiKey.trim(), baseUrl || undefined)
    if (modelsResult && modelsResult.length > 0) {
      availableModels.value = modelsResult
      connectionTested.value = true
      errors.apiKey = ''
      // 默认选中第一个模型（用户可直接进入下一步）
      form.model = modelsResult[0].id
    } else {
      window.dispatchEvent(new CustomEvent('global-tip', {
        detail: { type: 'error', code: 'connection:test:no_models', message: '连接测试失败：该提供商未返回可用模型' }
      }))
    }
  } catch {
    // 连接失败错误提示由 preload inv 拦截统一派发（GlobalTipToast）
  } finally {
    testingConnection.value = false
  }
}

async function submitStep3() {
  if (loading.value) return
  if (!validateStep3()) return
  loading.value = true
  try {
    const body: InitAccountParams = {
      nickname: form.nickname.trim() || 'Default Agent',
      llmProvider: form.provider,
      llmModel: form.model.trim(),
      llmApiKey: form.apiKey.trim()
    }
    if (form.baseUrl.trim()) body.llmBaseUrl = form.baseUrl.trim()
    await window.api.account.initStep3(body)
    await afterStepSaved()
  } catch {
    // 错误提示由 preload inv 拦截统一派发（GlobalTipToast）
  } finally {
    loading.value = false
  }
}

function validateStep3(): boolean {
  let ok = true
  if (!form.provider) { errors.provider = '请选择提供商'; ok = false } else { errors.provider = '' }
  if (!form.apiKey.trim()) { errors.apiKey = '请输入 API Key'; ok = false } else { errors.apiKey = '' }
  if (!connectionTested.value) { errors.model = '请先测试连接以获取可用模型'; ok = false }
  else if (!form.model.trim()) { errors.model = '请选择模型'; ok = false } else { errors.model = '' }
  return ok
}

// ── Step 4：绑定主聊天场景 ──

async function loadSavedModels() {
  try {
    const data = await window.api.models.list('default')
    savedModels.value = (data as CustomModelInfo[]) ?? []
  } catch {
    savedModels.value = []
  }
}

async function submitStep4() {
  if (loading.value || !form.bindModelId) return
  loading.value = true
  try {
    await window.api.account.initStep4(form.bindModelId)
    await afterStepSaved()
  } catch {
    // 错误提示由 preload inv 拦截统一派发（GlobalTipToast）
  } finally {
    loading.value = false
  }
}

// ── 启动 ──

onMounted(async () => {
  // 加载提供商列表（Step 3 用）
  providersLoading.value = true
  try {
    const providersData = await modelsApi.listProviders()
    if (providersData && providersData.length > 0) {
      providers.value = providersData
    }
  } catch {
    // 保留空列表
  } finally {
    providersLoading.value = false
  }
  // 加载已保存模型（Step 4 用）
  await loadSavedModels()
  // 执行 4 项检查 → 定位第一个未通过步骤
  await runChecks()
})
</script>

<style scoped>
/* ── Apple HIG 节点式步骤进度条 ── */
.init-stepper {
  display: flex;
  align-items: flex-start;
  flex-shrink: 0;   /* 步骤条整体不收缩（圆形节点不被压缩） */
  margin: 0 0 var(--tk-space-7);
  padding: 4px 0 0;   /* 顶部留 4px：active 节点 halo（box-shadow 0 0 0 4px）不被滚动容器裁剪 */
  list-style: none;
}

.init-step {
  position: relative;
  flex: 1;
  flex-shrink: 0;   /* 外层高度压缩时不被压扁（保护圆形节点完整） */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--tk-space-2);
}

/* Step2 表单滚动由外层 layout-card__form 统一负责（隐藏滚动条） */

/* 连接线（除第一个节点外，左侧画线连接上一个节点） */
.init-step:not(:first-child)::before {
  content: '';
  position: absolute;
  top: 14px;
  left: -50%;
  width: 100%;
  height: 2px;
  background: var(--tk-border);
  z-index: 0;
  transition: background-color var(--tk-duration-normal) ease-in-out;
}

.init-step--done::before {
  background: var(--tk-accent);
}

.init-step__node {
  position: relative;
  z-index: 1;
  flex-shrink: 0;   /* 圆形节点永不收缩（防截断） */
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--tk-text-primary);
  transition:
    background-color var(--tk-duration-normal) ease-in-out,
    border-color var(--tk-duration-normal) ease-in-out,
    color var(--tk-duration-normal) ease-in-out,
    box-shadow var(--tk-duration-normal) ease-in-out;
}

/* 完成：实心蓝 + 白勾 */
.init-step--done .init-step__node {
  background: var(--tk-accent);
  color: #ffffff;
}

.init-step__check {
  display: block;
}

/* 进行中：实心蓝 + halo 聚焦 */
.init-step--active .init-step__node {
  background: var(--tk-accent);
  color: #ffffff;
  box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.15);
}

/* 未完成：浅灰底 + 灰描边 */
.init-step--pending .init-step__node {
  background: var(--tk-bg-secondary);
  border: 1px solid var(--tk-border);
  color: var(--tk-text-tertiary);
}

.init-step__label {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.init-step__title {
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  color: var(--tk-text-primary);
  text-align: center;
  transition: color var(--tk-duration-normal) ease-in-out;
}

.init-step--pending .init-step__title {
  color: var(--tk-text-tertiary);
}

.init-step--active .init-step__title {
  font-weight: 600;
}

/* 动效降级：尊重系统减弱动效 */
@media (prefers-reduced-motion: reduce) {
  .init-step__node,
  .init-step:not(:first-child)::before,
  .init-step__title {
    transition: none;
  }
}

/* ── 表单 ── */
.init__api-key-row {
  display: flex;
  width: 100%;
  gap: var(--tk-space-2);
}

.init__desc {
  font-size: var(--tk-fs-body);
  color: var(--tk-text-secondary);
  line-height: 1.6;
  margin: 0;
}

.init__transition {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--tk-space-8) 0;
  gap: var(--tk-space-4);
}

.init__transition-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--tk-bg-secondary);
  border-top-color: var(--tk-accent);
  border-radius: 50%;
  animation: init-spin 0.8s linear infinite;
}

.init__transition-text {
  font-size: var(--tk-fs-body);
  color: var(--tk-text-secondary);
  margin: 0;
}

@keyframes init-spin {
  to {
    transform: rotate(360deg);
  }
}

.init-fade-enter-active,
.init-fade-leave-active {
  transition: opacity var(--tk-duration-normal) ease-in-out;
}

.init-fade-enter-from,
.init-fade-leave-to {
  opacity: 0;
}
</style>
