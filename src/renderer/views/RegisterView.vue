<template>
  <FullScreenCardLayout>
    <template #brand>
      <div class="register__brand-row">
        <BannerBrand />
      </div>
    </template>

    <template #heading>注册</template>
    <template #subtitle>创建您的 Showing Ai 账号</template>

    <template #form>
      <n-form @submit.prevent="handleRegister">
        <n-form-item
          label="用户名"
          :feedback="errors.username"
          :validation-status="errors.username ? 'error' : undefined"
        >
          <n-input
            v-model:value="form.username"
            type="text"
            placeholder="您的用户名"
            :disabled="loading"
            @blur="validateField('username')"
            @update:value="markDirty"
          />
        </n-form-item>

        <n-form-item
          label="邮箱"
          :feedback="errors.email"
          :validation-status="errors.email ? 'error' : undefined"
        >
          <n-input
            v-model:value="form.email"
            type="email"
            placeholder="your@email.com"
            :disabled="loading"
            @blur="validateField('email')"
            @update:value="markDirty"
          />
        </n-form-item>

        <n-form-item
          label="密码"
          :feedback="errors.password"
          :validation-status="errors.password ? 'error' : undefined"
        >
          <n-input
            v-model:value="form.password"
            type="password"
            placeholder="至少 8 位密码"
            :disabled="loading"
            show-password-toggle
            @blur="validateField('password')"
            @update:value="markDirty"
          />
        </n-form-item>

        <n-form-item
          label="确认密码"
          :feedback="errors.confirmPassword"
          :validation-status="errors.confirmPassword ? 'error' : undefined"
        >
          <n-input
            v-model:value="form.confirmPassword"
            type="password"
            placeholder="再次输入密码"
            :disabled="loading"
            show-password-toggle
            @blur="validateField('confirmPassword')"
            @update:value="markDirty"
          />
        </n-form-item>

        <n-form-item
          label="邮箱验证码"
          :feedback="errors.code"
          :validation-status="errors.code ? 'error' : undefined"
        >
          <div class="register__code-row">
            <n-input
              v-model:value="form.code"
              type="text"
              placeholder="6 位验证码"
              maxlength="6"
              :disabled="loading"
              @blur="validateField('code')"
              @update:value="markDirty"
            />
            <n-button
              :disabled="codeSending || countdown > 0 || !form.email.trim()"
              :loading="codeSending"
              class="register__code-btn"
              @click="sendCode"
            >
              {{ countdown > 0 ? `${countdown}s` : '发送验证码' }}
            </n-button>
          </div>
        </n-form-item>

        <p v-if="formError" class="register__form-error">{{ formError }}</p>

        <n-button
          type="primary"
          attr-type="submit"
          block
          size="large"
          :loading="loading"
          :disabled="!canSubmit"
        >
          注册
        </n-button>
      </n-form>
    </template>

    <template #footer>
      已有账号？
      <router-link to="/login" class="register__link">登录</router-link>
    </template>
  </FullScreenCardLayout>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { NForm, NFormItem, NInput, NButton } from 'naive-ui'
import { FullScreenCardLayout, BannerBrand } from '@/renderer/components'
import { useAuthStore } from '@/stores/auth-store'
import { ApiError } from '@/defines/api/types'

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const formError = ref('')
const hasDirty = ref(false)
const codeSending = ref(false)
const countdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

const form = reactive({
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  code: '',
})

const errors = reactive({
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  code: '',
})

const FIELDS = ['username', 'email', 'password', 'confirmPassword', 'code'] as const

const canSubmit = computed(() =>
  form.username.trim() &&
  form.email.trim() &&
  form.password.length >= 8 &&
  form.password === form.confirmPassword &&
  form.code.trim().length === 6
)

function markDirty() {
  hasDirty.value = true
}

function validateField(field: typeof FIELDS[number]) {
  switch (field) {
    case 'username':
      errors.username = form.username.trim().length >= 2
        ? ''
        : '用户名至少 2 个字符'
      break
    case 'email':
      errors.email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
        ? ''
        : '请输入有效的邮箱地址'
      break
    case 'password':
      errors.password = form.password.length >= 8 && /[a-zA-Z]/.test(form.password) && /\d/.test(form.password)
        ? ''
        : '密码需至少 8 位，包含字母和数字'
      break
    case 'confirmPassword':
      errors.confirmPassword = form.confirmPassword === form.password && form.confirmPassword.length > 0
        ? ''
        : '两次输入的密码不一致'
      break
    case 'code':
      errors.code = /^\d{6}$/.test(form.code.trim())
        ? ''
        : '请输入 6 位数字验证码'
      break
  }
}

function validateAll(): boolean {
  FIELDS.forEach(validateField)
  return !Object.values(errors).some(Boolean)
}

function getApiError(err: unknown, fieldMap: Record<string, string>): { field?: string; message: string } {
  if (err instanceof ApiError) {
    const status = err.code
    if (status === 409 && err.response) {
      // 从后端响应中判断冲突字段
      const data = err.response as any
      if (data?.field === 'email') {
        const msg = fieldMap['email']
        if (msg) return { field: 'email', message: msg }
      }
      if (data?.field === 'username') {
        const msg = fieldMap['username']
        if (msg) return { field: 'username', message: msg }
      }
      return { message: '该账号已存在' }
    }
    if (status === 422) return { message: '输入信息不符合要求，请检查后重试' }
    return { message: err.message }
  }
  if (err instanceof Error) return { message: err.message }
  return { message: '网络连接失败，请检查网络' }
}

async function sendCode() {
  if (codeSending.value || countdown.value > 0) return

  // 先验证邮箱
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = '请先输入有效的邮箱地址'
    return
  }

  codeSending.value = true
  formError.value = ''
  try {
    await authStore.sendEmailCode(form.email.trim())
    // 开始 60s 倒计时
    countdown.value = 60
    countdownTimer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) {
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
      }
    }, 1000)
    formError.value = ''
  } catch (e) {
    const apiErr = getApiError(e, {})
    formError.value = apiErr.message
  } finally {
    codeSending.value = false
  }
}

async function handleRegister() {
  if (loading.value) return
  if (!validateAll()) return

  loading.value = true
  formError.value = ''

  try {
    await authStore.register({
      email: form.email.trim(),
      password: form.password,
      nickname: form.username.trim(),
      code: form.code.trim(),
    })

    // 注册成功 → 跳登录页让用户确认凭据
    router.replace({
      name: 'login',
      query: { username: form.username.trim() },
    })
  } catch (e) {
    const apiErr = getApiError(e, {
      email: '该邮箱已被注册',
      username: '该用户名已被使用',
    })
    if (apiErr.field === 'email') {
      errors.email = apiErr.message
    } else if (apiErr.field === 'username') {
      errors.username = apiErr.message
    } else {
      formError.value = apiErr.message
    }
  } finally {
    loading.value = false
  }
}

onBeforeUnmount(() => {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
})
</script>

<style scoped>
.register__brand-row {
  margin-bottom: 0;
}

.register__form-error {
  font-size: var(--sa-fs-body);
  color: var(--sa-destructive);
  margin-bottom: 12px;
  text-align: center;
}

.register__link {
  color: var(--sa-accent);
  text-decoration: none;
  font-weight: 500;
}

.register__link:hover {
  text-decoration: underline;
}

.register__code-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.register__code-row .n-input {
  flex: 1;
  min-width: 0;
}
.register__code-btn {
  width: 130px;
  flex-shrink: 0;
}
</style>
