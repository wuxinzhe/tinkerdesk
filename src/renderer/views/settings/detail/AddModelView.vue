<template>
  <L3PageLayout class="page-layout">
    <SaSection title="添加模型">
      <CustomModelForm :form="form" mode="add" :error-message="formError">
        <SaFormActions
          primary-text="创建"
          :primary-loading="saving"
          @primary="save"
          @cancel="goBack"
        />
      </CustomModelForm>
    </SaSection>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { L3PageLayout, SaSection, SaFormActions } from '@/renderer/components'
import CustomModelForm from '@/renderer/components/settings/CustomModelForm.vue'
import { modelsApi } from '@/renderer/api/models-api'

const router = useRouter()

const form = reactive({
  alias: '', providerId: 'deepseek', modelName: '', apiKey: '', baseUrl: '', contextLimit: 128000
})

const saving = ref(false)
const formError = ref('')

const formValid = computed(() => form.alias && form.modelName && !!form.contextLimit)

async function save() {
  if (!formValid.value) return
  saving.value = true
  formError.value = ''
  try {
    await modelsApi.createCustomModel('default', {
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

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.replace('/workspace/settings/model')
  }
}
</script>

<style scoped>
.page-layout {
  padding: 24px;
  width: 100%;
  overflow-y: auto;
  scrollbar-width: none;
}
.page-layout::-webkit-scrollbar { display: none; }
</style>
