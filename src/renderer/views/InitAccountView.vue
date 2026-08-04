<template>
  <FullScreenCardLayout>
    <template #brand>
      <BannerBrand />
    </template>

    <template #heading>初始化设置</template>
    <template #subtitle>配置您的 AI 模型以开始使用</template>

    <template #form>
      <n-form @submit.prevent="handleInit">
        <n-form-item
          label="昵称"
          :feedback="errors.nickname"
          :validation-status="errors.nickname ? 'error' : undefined"
        >
          <n-input
            v-model:value="form.nickname"
            placeholder="给 Agent 起个名字"
            :disabled="loading"
          />
        </n-form-item>

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
            />
            <n-button
              :loading="testingConnection"
              :disabled="!form.apiKey.trim() || !form.provider || testingConnection"
              @click="testConnection"
            >
              测试连接
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

        <p v-if="connectionError" class="init__connection-error">{{ connectionError }}</p>
        <p v-if="formError" class="init__form-error">{{ formError }}</p>

        <n-button
          type="primary"
          attr-type="submit"
          block
          size="large"
          :loading="loading"
          :disabled="!canSubmit"
        >
          完成设置
        </n-button>
      </n-form>
    </template>
  </FullScreenCardLayout>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NForm, NFormItem, NInput, NSelect, NButton } from 'naive-ui'
import { FullScreenCardLayout, BannerBrand } from '@/renderer/components'
import { ApiError } from '@/defines/api/types'
import { useModelStore } from '@/stores/model-store'
import { useAuthStore } from '@/stores/auth-store'

interface ProviderInfo {
  id: string
  name: string
  base_url: string
  api_mode: string
  support_custom_base_url: boolean
  support_custom_models: boolean
  description: string
  sort_order: number
}

interface ModelInfo {
  id: string
  object: string
  owned_by: string
}

const router = useRouter()
const modelStore = useModelStore()
const authStore = useAuthStore()

const providers = ref<ProviderInfo[]>([])
const providersLoading = ref(false)
const testingConnection = ref(false)
const connectionTested = ref(false)
const connectionError = ref('')
const loading = ref(false)
const formError = ref('')

const form = reactive({
  nickname: '',
  provider: '',
  apiKey: '',
  model: '',
  baseUrl: ''
})

const errors = reactive({
  nickname: '',
  provider: '',
  apiKey: '',
  model: ''
})

// ── 从 API 加载提供商列表 ──

onMounted(async () => {
  providersLoading.value = true
  try {
    const providersData = await modelStore.listProviders()
    if (providersData && providersData.length > 0) {
      providers.value = providersData
    }
  } catch {
    // 加载失败时保留空列表
  } finally {
    providersLoading.value = false
  }
})

// ── 计算属性 ──

const providerOptions = computed(() =>
  providers.value.map(p => ({
    label: p.name,
    value: p.id
  }))
)

const selectedProvider = computed(() =>
  providers.value.find(p => p.id === form.provider)
)

const selectedProviderBaseUrl = computed(() =>
  selectedProvider.value?.base_url || ''
)

const modelOptions = computed(() =>
  connectionTested.value
    ? availableModels.value.map(m => ({
        label: m.id,
        value: m.id
      }))
    : []
)

const canSubmit = computed(() =>
  form.nickname.trim() !== '' &&
  form.provider !== '' &&
  form.apiKey.trim() !== '' &&
  form.model.trim() !== ''
)

const availableModels = ref<ModelInfo[]>([])

// ── 事件 ──

function onProviderChange() {
  form.apiKey = ''
  form.model = ''
  connectionTested.value = false
  connectionError.value = ''
  availableModels.value = []
  errors.apiKey = ''
  errors.model = ''
}

async function testConnection() {
  if (!form.provider || !form.apiKey.trim()) return

  testingConnection.value = true
  connectionError.value = ''
  connectionTested.value = false
  form.model = ''
  errors.model = ''

  try {
    const baseUrl = form.baseUrl.trim() || selectedProviderBaseUrl.value

    const modelsResult = await modelStore.fetchModels(form.provider, form.apiKey.trim(), baseUrl || '')
    if (modelsResult && modelsResult.length > 0) {
      availableModels.value = modelsResult
      connectionTested.value = true
      errors.apiKey = ''
    } else {
      connectionError.value = '连接测试失败'
    }
  } catch (e) {
    connectionError.value = getErrorMessage(e)
  } finally {
    testingConnection.value = false
  }
}

function validate(): boolean {
  let ok = true
  if (!form.nickname.trim()) { errors.nickname = '请输入昵称'; ok = false } else { errors.nickname = '' }
  if (!form.provider) { errors.provider = '请选择提供商'; ok = false } else { errors.provider = '' }
  if (!form.apiKey.trim()) { errors.apiKey = '请输入 API Key'; ok = false } else { errors.apiKey = '' }
  if (!connectionTested.value) { errors.model = '请先测试连接以获取可用模型'; ok = false }
  else if (!form.model.trim()) { errors.model = '请选择模型'; ok = false } else { errors.model = '' }
  return ok
}

function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return '网络连接失败，请检查网络'
}

async function handleInit() {
  if (loading.value) return
  if (!validate()) return

  loading.value = true
  formError.value = ''

  try {
    const body: Record<string, string> = {
      nickname: form.nickname.trim(),
      llmProvider: form.provider,
      llmModel: form.model.trim(),
      llmApiKey: form.apiKey.trim()
    }
    if (form.baseUrl.trim()) body.llmBaseUrl = form.baseUrl.trim()

    await authStore.initAccount(body)
    // 服务端已持久化 initialized=true，后续 SplashView 通过 /account/init-status 校验
    router.replace({ name: 'splash' })
  } catch (e) {
    formError.value = getErrorMessage(e)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.init__api-key-row {
  display: flex;
  width: 100%;
  gap: 8px;
}

.init__connection-error {
  font-size: var(--sa-fs-body);
  color: var(--sa-destructive);
  margin-bottom: 12px;
  text-align: center;
}

.init__form-error {
  font-size: var(--sa-fs-body);
  color: var(--sa-destructive);
  margin-bottom: 12px;
  text-align: center;
}
</style>
