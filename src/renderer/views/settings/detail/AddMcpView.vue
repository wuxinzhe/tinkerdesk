<template>
  <L3PageLayout class="mcp-page">
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><path d=&quot;M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z&quot;/></svg>"
      gradient="linear-gradient(135deg, #52e57f 0%, var(--tk-success) 100%)"
      title="添加 MCP 服务器"
      desc="接入一个 MCP 协议工具服务器"
    />
    <SaSection>
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
import { getToolCenterApi } from '@/renderer/api/tool-center-api'
import { L3PageLayout, SaSection, SaFormActions, SaPageHero } from '@/renderer/components'
import McpServerForm from '@/renderer/components/settings/McpServerForm.vue'

const router = useRouter()
const mcpApi = getToolCenterApi()

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
    addError.value = (e as Error).message || '连接失败'
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
  /* padding 由 L3PageLayout 统一提供 */
  width: 100%;
  overflow-y: auto;
}
.mcp-page {
  /* 滚动条全局统一 */
}
</style>
