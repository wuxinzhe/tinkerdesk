<template>
  <L3PageLayout class="mcp-page">
    <SaSection title="编辑 MCP 服务器">
      <McpServerForm :form="form" :error-message="error">
        <SaFormActions
          primary-text="保存"
          :primary-loading="saving"
          danger-text="删除"
          :danger-disabled="deleting"
          @primary="onSave"
          @cancel="goBack"
          @danger="onDelete"
        />
      </McpServerForm>
    </SaSection>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToolCenterStore } from '@/stores/tool-center-store'
import { L3PageLayout, SaSection, SaFormActions } from '@/renderer/components'
import McpServerForm from '@/renderer/components/settings/McpServerForm.vue'

const route = useRoute()
const router = useRouter()
const toolCenterStore = useToolCenterStore()

const serverName = computed(() => route.params.name as string)
const saving = ref(false)
const deleting = ref(false)
const error = ref('')

const form = ref({
  name: '', transport: 'stdio' as 'stdio' | 'http',
  command: '', argsStr: '', url: ''
})

async function loadServer() {
  try {
    const state = await toolCenterStore.getState()
    const server = state.mcpServers.find(s => s.name === serverName.value)
    if (!server) { error.value = '服务器不存在'; return }
    form.value.name = server.name
    form.value.transport = server.transport
    form.value.command = server.command ?? ''
    form.value.argsStr = (server.args ?? []).join(' ')
    form.value.url = server.url ?? ''
  } catch (e: any) {
    error.value = e.message || '加载失败'
  }
}

async function onSave() {
  saving.value = true
  error.value = ''
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
    error.value = e.message || '保存失败'
  } finally {
    saving.value = false
  }
}

async function onDelete() {
  if (deleting.value) return
  deleting.value = true
  try {
    await toolCenterStore.removeMcpServer(serverName.value)
    router.back()
  } catch { /* ignore */
  } finally { deleting.value = false }
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.replace('/workspace/settings/mcp')
  }
}

onMounted(loadServer)
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
