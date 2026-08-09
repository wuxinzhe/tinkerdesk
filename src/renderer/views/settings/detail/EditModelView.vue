<template>
  <L3PageLayout class="page-layout">
    <!-- 页头 -->
    <SaPageHero
      icon='<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>'
      gradient="linear-gradient(135deg, #4d9fff 0%, var(--tk-accent) 100%)"
      title="编辑模型"
      desc="修改模型提供商配置"
    />
    <SaSection>
      <CustomModelForm :form="form" mode="edit" :error-message="formError">
        <SaFormActions
          primary-text="保存"
          :primary-loading="saving"
          danger-text="删除"
          :danger-disabled="deleting"
          @primary="save"
          @cancel="goBack"
          @danger="deleteModel"
        />
      </CustomModelForm>
    </SaSection>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { L3PageLayout, SaSection, SaFormActions, SaPageHero } from '@/renderer/components'
import CustomModelForm from '@/renderer/components/settings/CustomModelForm.vue'
import { modelsApi } from '@/renderer/api/models-api'

const route = useRoute()
const router = useRouter()

const modelId = computed(() => route.params.modelId as string)

const form = reactive({
  alias: '', providerId: 'deepseek', modelName: '', apiKey: '', baseUrl: '', contextLimit: 128000
})

const saving = ref(false)
const deleting = ref(false)
const formError = ref('')

async function loadModel() {
  try {
    const models = await modelsApi.listCustomModels('default')
    const m = models.find(m => m.id === modelId.value)
    if (!m) { formError.value = '模型不存在'; return }
    form.alias = m.alias
    form.providerId = m.providerId
    form.modelName = m.modelName
    form.baseUrl = m.baseUrl ?? ''
    form.contextLimit = m.contextLimit ?? 128000
    form.apiKey = ''
  } catch (e) {
    formError.value = (e as Error).message ?? '加载模型失败'
  }
}

const formValid = computed(() => form.alias && form.modelName && !!form.contextLimit)

async function save() {
  if (!formValid.value) return
  saving.value = true
  formError.value = ''
  try {
    await modelsApi.updateCustomModel('default', modelId.value, {
      alias: form.alias, modelName: form.modelName,
      providerId: form.providerId, apiKey: form.apiKey || undefined,
      baseUrl: form.baseUrl || undefined, contextLimit: form.contextLimit || 128000
    })
    router.back()
  } catch (e) {
    formError.value = (e as Error).message ?? '保存失败'
  } finally {
    saving.value = false
  }
}

async function deleteModel() {
  if (deleting.value) return
  deleting.value = true
  try {
    await modelsApi.deleteCustomModel('default', modelId.value)
    router.back()
  } catch { /* ignore */
  } finally { deleting.value = false }
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.replace('/workspace/settings/model')
  }
}

onMounted(loadModel)
</script>

<style scoped>
.page-layout {
  /* padding 由 L3PageLayout 统一提供 */
  max-width: 680px;
  width: 100%;
  overflow-y: auto;
  scrollbar-width: none;
}
.page-layout::-webkit-scrollbar { display: none; }
</style>
