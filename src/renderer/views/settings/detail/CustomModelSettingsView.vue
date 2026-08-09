<template>
  <div class="cms-page">
    <!-- 自定义模型 -->
    <SaSection title="自定义模型">
      <SaLoading v-if="loading" />
      <SaEmpty v-else-if="models.length === 0" icon="box" text="尚未配置自定义模型" />

        <div v-else class="cms-rows">
          <SaCardRow
            v-for="m in models"
            :key="m.id"
            :title="m.alias"
            :badge="m.testPassed ? '已测试' : '未测试'"
            :badge-variant="m.testPassed ? 'success' : 'warning'"
          >
            <template #meta>
              <span>{{ providerName(m.providerId) }} / {{ m.modelName }}</span>
            </template>
            <template #actions>
              <button class="cms-act cms-act--test" :disabled="testingId === m.id" @click="testModel(m)">
                {{ testingId === m.id ? '测试…' : '测试' }}
              </button>
              <button class="cms-act cms-act--edit" @click="router.push('/workspace/settings/model/' + m.id + '/edit')">编辑</button>
              <button class="cms-act cms-act--del" :disabled="deletingId === m.id" @click="deleteModel(m)">删除</button>
            </template>
          </SaCardRow>
        </div>

      </SaSection>

    <!-- L3 工具栏动作 -->
    <ToolbarActions>
      <button class="toolbar-btn" @click="router.push('/workspace/settings/model/create')" title="添加模型">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </ToolbarActions>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { CustomModelInfo, SystemProvider } from '@/renderer/api/types'
import { SaSection, SaLoading, SaEmpty, SaCardRow } from '@/renderer/components'
import ToolbarActions from '@/renderer/components/workspace/ToolbarActions.vue'
import { modelsApi } from '@/renderer/api/models-api'

const router = useRouter()

const providers = ref<SystemProvider[]>([])

function providerName(id: string): string {
  return providers.value.find(p => p.id === id)?.name ?? id
}

// ── Models ──
const models = ref<CustomModelInfo[]>([])
const loading = ref(false)

async function loadModels() {
  loading.value = true
  try {
    const res = await modelsApi.listCustomModels('default')
    models.value = res ?? []
  } catch {
    models.value = []
  } finally {
    loading.value = false
  }
}

// ── Actions ──
const testingId = ref<string | null>(null)
const deletingId = ref<string | null>(null)

async function testModel(m: CustomModelInfo) {
  testingId.value = m.id
  try {
    const result = await modelsApi.testCustomModel('default', m.id)
    // 模型测试的业务结果嵌套在 data 内（外层 success=true），inv 拦截不适用——
    // 由前端根据返回结果手动吊起全局提示
    if (result && !result.success) {
      window.dispatchEvent(new CustomEvent('global-tip', {
        detail: { type: 'error', code: 'model:test:failed', message: result.message || '模型测试失败' }
      }))
    }
    await loadModels()
  } catch { /* ignore */
  } finally { testingId.value = null }
}

async function deleteModel(m: CustomModelInfo) {
  if (deletingId.value) return
  deletingId.value = m.id
  try {
    await modelsApi.deleteCustomModel('default', m.id)
    await loadModels()
  } catch { /* ignore */
  } finally {
    deletingId.value = null
  }
}

onMounted(async () => {
  providers.value = await modelsApi.listProviders()
  await loadModels()
})
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════
   macOS Settings 风格 — 自定义模型管理
   ═══════════════════════════════════════════════════════ */

.cms-page {
  padding: 24px 24px 48px;
  width: 100%;
  overflow-y: auto;
  scrollbar-width: none;
}

.cms-page::-webkit-scrollbar {
  display: none;
}

/* ── Action buttons ── */

.cms-act {
  height: 24px;
  padding: 0 10px;
  border: none;
  border-radius: 5px;
  background: transparent;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  /* emil：指定属性过渡 + 强 ease-out + 按压 */
  transition: background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 150ms cubic-bezier(0.23, 1, 0.32, 1);
  color: var(--sa-text-secondary, #86868b);
}

@media (hover: hover) and (pointer: fine) {
  .cms-act:hover {
    background: var(--sa-bg-secondary, #f5f5f7);
  }
  .cms-act--test:hover {
    background: rgba(52, 199, 89, 0.06);
  }
  .cms-act--edit:hover {
    background: rgba(0, 122, 255, 0.06);
  }
  .cms-act--del:hover {
    background: rgba(255, 59, 48, 0.06);
  }
}

/* ── 手机模式：模型列表改卡片 ── */
@media (max-width: 767px) {
  .cms-page {
    padding: 16px 8px;
  }
  .cms-rows {
    gap: 8px;
  }

  /* 手机：按钮自然换行到 meta 下方 */
  :deep(.sa-card-row) {
    flex-wrap: wrap;
  }
  :deep(.sa-card-row__body) {
    flex: 0 0 100%;
    padding-right: 0;
  }
  :deep(.sa-card-row__actions) {
    position: static;
    margin-top: 4px;
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
