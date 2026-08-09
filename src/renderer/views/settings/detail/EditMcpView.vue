<template>
  <L3PageLayout class="mcp-page">
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><path d=&quot;M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z&quot;/></svg>"
      gradient="linear-gradient(135deg, #52e57f 0%, var(--tk-success) 100%)"
      title="编辑 MCP 服务器"
      desc="修改 MCP 服务器配置"
    />
    <SaSection>
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
import { getToolCenterApi } from '@/renderer/api/tool-center-api'
import { L3PageLayout, SaSection, SaFormActions, SaPageHero } from '@/renderer/components'
import McpServerForm from '@/renderer/components/settings/McpServerForm.vue'

const route = useRoute()
const router = useRouter()
const mcpApi = getToolCenterApi()

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
    const state = await mcpApi.getState()
    const server = state.mcpServers.find(s => s.name === serverName.value)
    if (!server) { error.value = '服务器不存在'; return }
    form.value.name = server.name
    form.value.transport = server.transport
    form.value.command = server.command ?? ''
    form.value.argsStr = (server.args ?? []).join(' ')
    form.value.url = server.url ?? ''
  } catch (e) {
    error.value = (e as Error).message || '加载失败'
  }
}

async function onSave() {
  saving.value = true
  error.value = ''
  try {
    await mcpApi.upsertMcpServer({
      name: form.value.name,
      transport: form.value.transport,
      command: form.value.command || undefined,
      args: form.value.argsStr ? form.value.argsStr.split(/\s+/).filter(Boolean) : [],
      url: form.value.url || undefined,
      enabled: true
    })
    router.back()
  } catch (e) {
    error.value = (e as Error).message || '保存失败'
  } finally {
    saving.value = false
  }
}

async function onDelete() {
  if (deleting.value) return
  deleting.value = true
  try {
    await mcpApi.removeMcpServer(serverName.value)
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
  /* padding 由 L3PageLayout 统一提供 */
  max-width: 680px;
  width: 100%;
  overflow-y: auto;
  scrollbar-width: none;
}
.mcp-page::-webkit-scrollbar { display: none; }
</style>
