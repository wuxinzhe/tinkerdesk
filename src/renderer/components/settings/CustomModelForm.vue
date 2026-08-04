<template>
  <div class="cm-form">
    <!-- Row 1: 别名 + 供应商 -->
    <div class="cm-form__row">
      <SaFormGroup label="别名" required class="cm-form__group">
        <input
          v-model="form.alias"
          class="cm-input"
          placeholder="如：我的主力模型"
        />
      </SaFormGroup>
      <SaFormGroup label="供应商" required class="cm-form__group">
        <div class="cm-select-wrap">
          <select v-model="form.providerId" class="cm-input cm-input--select" @change="onProviderChange">
            <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <svg class="cm-select-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </SaFormGroup>
    </div>

    <!-- Row 2: 模型名 + 上下文窗口 -->
    <div class="cm-form__row">
      <SaFormGroup label="模型名" required class="cm-form__group">
        <div class="cm-model-row">
          <div class="cm-select-wrap cm-model-row__select">
            <select v-model="form.modelName" class="cm-input cm-input--select" :disabled="!modelsFetched">
              <option value="" disabled>{{ modelsFetched ? '请选择模型' : '请先获取模型列表' }}</option>
              <option v-for="m in fetchedModels" :key="m.id" :value="m.id">{{ m.id }}</option>
            </select>
            <svg class="cm-select-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
          <button class="cm-fetch-btn" :disabled="!form.apiKey || fetchingModels" @click="fetchModelList" :title="form.apiKey ? '从供应商接口获取模型列表' : '请先填写 API Key'">
            <svg v-if="fetchingModels" class="cm-fetch-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" />
            </svg>
            <template v-else>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
              </svg>
            </template>
          </button>
        </div>
      </SaFormGroup>
      <SaFormGroup label="上下文窗口" required class="cm-form__group cm-form__group--narrow">
        <input
          v-model.number="form.contextLimit"
          type="number"
          class="cm-input"
          min="1"
          placeholder="128000"
        />
      </SaFormGroup>
    </div>

    <!-- Row 3: API Key -->
    <SaFormGroup label="API Key" class="cm-form__group">
      <div class="cm-key-wrap">
        <input
          v-model="form.apiKey"
          class="cm-input cm-input--key"
          :type="showApiKey ? 'text' : 'password'"
          :placeholder="mode === 'edit' ? '输入新 Key 以更新（留空不修改）' : 'sk-...'"
        />
        <button class="cm-key-toggle" @click="showApiKey = !showApiKey" type="button">
          <svg v-if="showApiKey" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    </SaFormGroup>

    <!-- Row 4: Base URL -->
    <SaFormGroup label="Base URL" class="cm-form__group">
      <input
        v-model="form.baseUrl"
        class="cm-input"
        placeholder="留空使用供应商默认 Endpoint"
      />
    </SaFormGroup>

    <!-- 底部操作区 -->
    <div class="cm-actions">
      <slot />
    </div>

    <!-- 反馈信息 -->
    <p v-if="errorMessage" class="cm-error">{{ errorMessage }}</p>
    <p v-if="formTestResult" class="cm-test-msg" :class="formTestResult.success ? 'cm-test-msg--ok' : 'cm-test-msg--fail'">
      <template v-if="formTestResult.success">✓ 连接成功</template>
      <template v-else>✗ {{ formTestResult.message }}</template>
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useModelStore } from '@/stores/model-store'
import type { SystemProvider } from '@/defines/models/model'
import { SaFormGroup } from '@/renderer/components'

withDefaults(defineProps<{
  form: {
    alias: string
    providerId: string
    modelName: string
    apiKey: string
    baseUrl: string
    contextLimit: number
  }
  mode?: 'add' | 'edit'
  errorMessage?: string
}>(), { mode: 'add', errorMessage: '' })

const modelStore = useModelStore()

const providers = ref<SystemProvider[]>([])

onMounted(async () => {
  providers.value = await modelStore.listProviders()
})

// ── Show/hide API key ──
const showApiKey = ref(false)

// ── Model fetching ──
const fetchingModels = ref(false)
const fetchedModels = ref<{ id: string }[]>([])
const modelsFetched = ref(false)
const formTestResult = ref<{ success: boolean; message: string } | null>(null)

function onProviderChange() {
  form.modelName = ''
  form.apiKey = ''
  fetchedModels.value = []
  modelsFetched.value = false
  formTestResult.value = null
}

async function fetchModelList() {
  if (!form.providerId || !form.apiKey) return
  fetchingModels.value = true
  formTestResult.value = null
  try {
    const models = await modelStore.fetchModels(form.providerId, form.apiKey, form.baseUrl || undefined)
    fetchedModels.value = models ?? []
    modelsFetched.value = true
    if (form.modelName && !fetchedModels.value.some(m => m.id === form.modelName)) {
      form.modelName = ''
    }
  } catch (e: any) {
    formTestResult.value = { success: false, message: e?.message ?? '获取模型列表失败' }
  } finally {
    fetchingModels.value = false
  }
}
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════
   CustomModelForm — 模型添加/编辑表单
   ═══════════════════════════════════════════════════════ */

.cm-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 24px;
}

/* 清除 SaFormGroup 自带 margin，用 gap 统一控制 */
.cm-form :deep(.sa-form-group) {
  margin-bottom: 0;
}

/* ── Row: side-by-side fields ── */

.cm-form__row {
  display: flex;
  gap: 16px;
}

/* ── Group overrides ── */

.cm-form__group {
  flex: 1;
  min-width: 0;
}

.cm-form__group--narrow {
  flex: 0 0 200px;
}

/* ── 手机模式：每行堆叠 ── */
@media (max-width: 767px) {
  .cm-form__row {
    flex-direction: column;
    gap: 8px;
  }
  .cm-form__group--narrow {
    flex: none;
  }
}

/* ── Input / Select ── */

.cm-input {
  display: block;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--sa-border-light, #e8e8ed);
  border-radius: 7px;
  background: var(--sa-bg-primary, #fff);
  font-size: 13px;
  font-family: inherit;
  color: var(--sa-text-primary, #1d1d1f);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.cm-input--select {
  padding-right: 28px;
  appearance: none;
  cursor: pointer;
}

.cm-input:focus {
  border-color: var(--sa-accent, #007aff);
  box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.10);
}

.cm-input::placeholder {
  color: var(--sa-text-tertiary, #aeaeb2);
}

.cm-input[type="number"]::-webkit-outer-spin-button,
.cm-input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

input.cm-input[type="number"] {
  -moz-appearance: textfield;
}

/* ── Select chevron ── */

.cm-select-wrap {
  position: relative;
}

.cm-select-chev {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--sa-text-tertiary, #aeaeb2);
}

/* ── Model row (select + fetch button) ── */

.cm-model-row {
  display: flex;
  gap: 6px;
  align-items: stretch;
}

.cm-model-row__select {
  flex: 1;
  min-width: 0;
}

.cm-fetch-btn {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--sa-accent, #007aff);
  border-radius: 7px;
  background: transparent;
  color: var(--sa-accent, #007aff);
  cursor: pointer;
  transition: background 0.12s, opacity 0.12s;
}

.cm-fetch-btn:hover {
  background: rgba(0, 122, 255, 0.06);
}

.cm-fetch-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.cm-fetch-spin {
  animation: cm-spin 0.8s linear infinite;
}

@keyframes cm-spin {
  to { transform: rotate(360deg); }
}

/* ── Key field ── */

.cm-key-wrap {
  position: relative;
}

.cm-input--key {
  padding-right: 42px;
}

.cm-key-toggle {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: var(--sa-text-tertiary, #aeaeb2);
  cursor: pointer;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  transition: background 0.12s, color 0.12s;
}

.cm-key-toggle:hover {
  background: rgba(0, 122, 255, 0.06);
  color: var(--sa-accent, #007aff);
}

/* ── Actions ── */

.cm-actions {
  margin-top: 6px;
}

/* ── Feedback ── */

.cm-error {
  margin: 4px 0 0;
  font-size: 12px;
  color: #ff3b30;
}

.cm-test-msg {
  margin: 4px 0 0;
  font-size: 12px;
}

.cm-test-msg--ok { color: #34c759; }
.cm-test-msg--fail { color: #ff3b30; }
</style>
