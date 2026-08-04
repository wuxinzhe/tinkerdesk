<template>
  <FullScreenCardLayout>
    <template #brand>
      <div class="login__brand-row">
        <BannerBrand />
      </div>
    </template>

    <template #heading>登录</template>
    <template #subtitle>使用您的账号登录工作台</template>

    <template #form>
      <n-form @submit.prevent="handleLogin">
        <n-form-item
          label="邮箱 / 手机号"
          :feedback="errors.account"
          :validation-status="errors.account ? 'error' : undefined"
        >
          <n-input
            v-model:value="form.account"
            type="text"
            placeholder="邮箱或手机号"
            :disabled="loading"
            @blur="validateField('account')"
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
            placeholder="输入密码"
            :disabled="loading"
            show-password-toggle
            @blur="validateField('password')"
          />
        </n-form-item>

        <p v-if="formError" class="login__form-error">{{ formError }}</p>

        <n-button
          type="primary"
          attr-type="submit"
          block
          size="large"
          :loading="loading"
          :disabled="!form.account || !form.password"
        >
          登录
        </n-button>
      </n-form>
    </template>

    <template #footer>
      还没有账号？
      <router-link to="/register" class="login__link">注册</router-link>
    </template>
  </FullScreenCardLayout>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NForm, NFormItem, NInput, NButton } from 'naive-ui'
import { FullScreenCardLayout, BannerBrand } from '@/renderer/components'
import { useAuthStore } from '@/stores/auth-store'
import { ApiError } from '@/defines/api/types'

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const formError = ref('')

const form = reactive({
  account: '',
  password: '',
})

const errors = reactive({
  account: '',
  password: '',
})

const VISIBLE_FIELDS = ['account', 'password'] as const

function validateField(field: typeof VISIBLE_FIELDS[number]) {
  if (field === 'account') {
    errors.account = form.account.trim() ? '' : '请输入邮箱或手机号'
  }
  if (field === 'password') {
    errors.password = form.password ? '' : '请输入密码'
  }
}

function validateAll(): boolean {
  VISIBLE_FIELDS.forEach(validateField)
  return !errors.account && !errors.password
}

function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 401) return '账号或密码错误'
    if (err.code === 404) return '该账号未注册'
    if (err.code === 422) return '输入信息不符合要求'
    return err.message
  }
  if (err instanceof Error) return err.message
  return '网络连接失败，请检查网络'
}

async function handleLogin() {
  if (loading.value) return
  if (!validateAll()) return

  loading.value = true
  formError.value = ''

  try {
    await authStore.login(form.account, form.password)
    // 登录成功后 authApi.login 已自动调 setTokens
    router.replace({ name: 'splash' })
  } catch (e) {
    formError.value = getErrorMessage(e)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login__brand-row {
  margin-bottom: 0;
}

.login__form-error {
  font-size: var(--sa-fs-body);
  color: var(--sa-destructive);
  margin-bottom: 12px;
  text-align: center;
}

.login__link {
  color: var(--sa-accent);
  text-decoration: none;
  font-weight: 500;
}

.login__link:hover {
  text-decoration: underline;
}
</style>
