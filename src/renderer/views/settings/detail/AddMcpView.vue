<template>
  <L3PageLayout class="mcp-page">
    <SaSection title="添加 MCP 服务器">
      <McpServerForm :form="form" :error-message="addError">
        <SaFormActions
          primary-text="添加并连接"
          :primary-loading="adding"
          @primary="onAdd"
          @cancel="goBack"
        />
      </McpServerForm>
    </SaSection>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToolCenterStore } from '@/stores/tool-center-store'
import { L3PageLayout, SaSection, SaFormActions } from '@/renderer/components'
import McpServerForm from '@/renderer/components/settings/McpServerForm.vue'

const router = useRouter()
const toolCenterStore = useToolCenterStore()

const adding = ref(false)
const addError = ref('')

const form = ref({
  name: '', transport: 'stdio' as 'stdio' | 'http',
  command: '', argsStr: '', url: ''
})

async function onAdd() {
  addError.value = ''
  adding.value = true
  try {
    await toolCenterStore.upsertMcpServer({
      name: form.value.name,
      transport: form.value.transport,
      command: form.value.command || undefined,
      args: form.value.argsStr ? form.value.argsStr.split(/\s+/).filter(Boolean) : [],
      url: form.value.url || undefined,
      enabled: true
    })
    router.back()
  } catch (e: any) {
    addError.value = e.message || '连接失败'
  } finally {
    adding.value = false
  }
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.replace('/workspace/settings/mcp')
  }
}
</script>

<style scoped>
.mcp-page {
  padding: 24px;
  width: 100%;
  overflow-y: auto;
  scrollbar-width: none;
}
.mcp-page::-webkit-scrollbar { display: none; }
</style>
