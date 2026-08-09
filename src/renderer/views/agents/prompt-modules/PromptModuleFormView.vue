<template>
  <div class="prompt-form">
    <!-- 页头 -->
    <SaPageHero
      icon='<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>'
      gradient="linear-gradient(135deg, #ffb340 0%, var(--tk-warning) 100%)"
      :title="isEdit ? '编辑模块' : '新增模块'"
      desc="提示词模块的编辑表单"
    />

    <div class="prompt-form__body">
      <div v-if="loading" class="prompt-form__loading">加载中...</div>

      <template v-else>
        <div class="prompt-form__field">
          <label>名称</label>
          <input v-model="formName" placeholder="模块名称" maxlength="128" />
        </div>

        <div class="prompt-form__field">
          <label>内容</label>
          <textarea v-model="formContent" placeholder="输入提示词内容…" rows="8" maxlength="3000"></textarea>
          <div class="prompt-form__counter">{{ formContent.length }} / 3000</div>
        </div>

        <details class="prompt-form__vars">
          <summary>可用变量</summary>
          <table v-pre>
            <tbody>
              <tr><td><code>{{os}}</code></td><td>操作系统</td></tr>
              <tr><td><code>{{arch}}</code></td><td>CPU 架构</td></tr>
              <tr><td><code>{{clientType}}</code></td><td>客户端类型</td></tr>
              <tr><td><code>{{shell}}</code></td><td>当前终端</td></tr>
              <tr><td><code>{{homeDir}}</code></td><td>用户主目录</td></tr>
              <tr><td><code>{{pathFormat}}</code></td><td>路径风格 (windows/unix)</td></tr>
              <tr><td><code>{{date}}</code></td><td>当前日期</td></tr>
              <tr><td><code>{{userId}}</code></td><td>用户 ID</td></tr>
              <tr><td><code>{{profile}}</code></td><td>Profile</td></tr>
            </tbody>
          </table>
        </details>

        <p v-if="formError" class="prompt-form__error">{{ formError }}</p>
      </template>
    </div>

    <div class="prompt-form__actions">
      <button class="prompt-form__cancel" @click="goBack">取消</button>
      <button class="prompt-form__save" @click="saveModule" :disabled="!formName.trim() || saving">
        {{ saving ? '保存中…' : '保存' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SaPageHero from '@/renderer/components/SaPageHero.vue'
import { promptModulesApi } from '@/renderer/api/prompt-modules-api'

const route = useRoute()
const router = useRouter()

const profile = computed(() => route.params.profile as string)
const moduleId = computed(() => route.params.moduleId as string | undefined)
const isEdit = computed(() => !!moduleId.value)

const loading = ref(true)
const formName = ref('')
const formContent = ref('')
const formError = ref('')
const saving = ref(false)

onMounted(async () => {
  if (isEdit.value) {
    try {
      // 在编辑模式下,从列表 API 反查当前模块数据
      const list = await promptModulesApi.list(profile.value)
      const mod = list.find(m => m.id === Number(moduleId.value))
      if (mod) {
        formName.value = mod.name
        formContent.value = mod.content
      } else {
        formError.value = '未找到该模块'
      }
    } catch (e) {
      formError.value = (e as Error).message ?? '加载失败'
    } finally {
      loading.value = false
    }
  } else {
    loading.value = false
  }
})

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push(`/workspace/agents/${profile.value}/prompt-modules`)
  }
}

async function saveModule() {
  if (!formName.value.trim()) return
  saving.value = true
  formError.value = ''
  try {
    if (isEdit.value) {
      await promptModulesApi.update(Number(moduleId.value), formName.value.trim(), formContent.value, profile.value)
    } else {
      await promptModulesApi.create(profile.value, formName.value.trim(), formContent.value)
    }
    goBack()
  } catch (e) {
    formError.value = (e as Error).message ?? '保存失败'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.prompt-form {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px 24px;
  max-width: 680px;
  width: 100%;
}

.prompt-form__header {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.prompt-form__body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding-bottom: 12px;
}

.prompt-form__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--tk-text-tertiary);
  font-size: 13px;
}

.prompt-form__field {
  margin-bottom: 12px;
}
.prompt-form__field label {
  display: block;
  font-size: 12px;
  color: var(--tk-text-secondary);
  margin-bottom: 4px;
}
.prompt-form__field input,
.prompt-form__field textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--tk-border);
  border-radius: 6px;
  font-size: 13px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-primary);
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
}
.prompt-form__field input:focus,
.prompt-form__field textarea:focus {
  border-color: var(--tk-accent);
}
.prompt-form__field textarea {
  resize: vertical;
  min-height: 120px;
}
.prompt-form__counter {
  text-align: right;
  font-size: 11px;
  color: var(--tk-text-tertiary);
  margin-top: 2px;
}

/* ── 变量帮助 ── */
.prompt-form__vars {
  margin-bottom: 12px;
  font-size: 12px;
}
.prompt-form__vars summary {
  cursor: pointer;
  color: var(--tk-text-secondary);
}
.prompt-form__vars table {
  width: 100%;
  margin-top: 6px;
  border-collapse: collapse;
}
.prompt-form__vars td {
  padding: 2px 8px;
  font-size: 11px;
  color: var(--tk-text-tertiary);
}
.prompt-form__vars td:first-child {
  font-family: monospace;
  color: var(--tk-accent);
  width: 100px;
}

/* ── 操作按钮 ── */
.prompt-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  flex-shrink: 0;
}
.prompt-form__cancel {
  padding: 6px 14px;
  border: 1px solid var(--tk-border);
  border-radius: 6px;
  background: transparent;
  color: var(--tk-text-secondary);
  font-size: 13px;
  cursor: pointer;
}
.prompt-form__save {
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  background: var(--tk-accent);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.prompt-form__save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.prompt-form__error {
  color: var(--tk-destructive);
  font-size: 12px;
  margin-top: 8px;
}
</style>
