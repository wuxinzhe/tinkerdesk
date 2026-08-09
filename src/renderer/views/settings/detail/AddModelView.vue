<template>
  <L3PageLayout class="page-layout">
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><path d=&quot;M4 7V4h16v3&quot;/><path d=&quot;M9 20h6&quot;/><path d=&quot;M12 4v16&quot;/></svg>"
      gradient="linear-gradient(135deg, #4d9fff 0%, var(--tk-accent) 100%)"
      title="添加模型"
      desc="配置一个自定义模型提供商"
    />
    <SaSection>
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
import { L3PageLayout, SaSection, SaFormActions, SaPageHero } from '@/renderer/components'
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
  /* padding 由 L3PageLayout 统一提供 */
  max-width: 680px;
  width: 100%;
  overflow-y: auto;
  scrollbar-width: none;
}
.page-layout::-webkit-scrollbar { display: none; }
</style>
