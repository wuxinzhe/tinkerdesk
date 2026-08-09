<template>
  <div class="mcp-settings-page">
    <div class="mcp-settings-page__header">
      <div class="mcp-settings-page__title">MCP 工具服务器</div>
      <div class="mcp-settings-page__desc">管理通过 MCP 协议接入的第三方工具。添加 MCP 服务器后，其提供的工具将自动注册到 Agent。</div>
    </div>

    <!-- 服务器列表 -->
    <div class="mcp-settings-page__list">
      <SaLoading v-if="loading" size="small" />

      <SaEmpty v-else-if="servers.length === 0" icon="box" text="尚未配置 MCP 服务器。" hint="点击右上角 + 按钮添加一个 stdio 或 HTTP 类型的 MCP 服务器。" />

      <div v-for="server in servers" :key="server.name" class="mcp-server-card">
        <div class="mcp-server-card__header">
          <div class="mcp-server-card__info">
            <div class="mcp-server-card__name">{{ server.name }}</div>
            <div class="mcp-server-card__transport">{{ server.transport === 'stdio' ? server.command : server.url }}</div>
          </div>
          <div class="mcp-server-card__status">
            <span :class="['status-dot', server.connected ? 'online' : 'offline']"></span>
            {{ server.connected ? '已连接' : '未连接' }}
          </div>
        </div>

        <!-- 工具列表 -->
        <div v-if="server.tools && server.tools.length > 0" class="mcp-server-card__tools">
          <div class="mcp-server-card__tools-title">工具 ({{ server.tools.length }})：</div>
          <div class="mcp-server-card__tool-tags">
            <span v-for="tool in server.tools" :key="tool.name" class="mcp-server-card__tool-tag">
              {{ tool.name }}
            </span>
          </div>
        </div>
        <div v-else-if="server.connected && server.tools.length === 0" class="mcp-server-card__tools-empty">
          已连接但未发现工具
        </div>

        <div v-if="server.error" class="mcp-server-card__error">{{ server.error }}</div>

        <div class="mcp-server-card__actions">
          <button class="mcp-server-card__btn mcp-server-card__btn--edit" @click="router.push('/workspace/settings/mcp/' + encodeURIComponent(server.name) + '/edit')">编辑</button>
          <button class="mcp-server-card__btn mcp-server-card__btn--delete" @click="onDelete(server.name)">删除</button>
        </div>
      </div>
    </div>

    <!-- L3 工具栏动作 -->
    <ToolbarActions>
      <button class="toolbar-btn" @click="router.push('/workspace/settings/mcp/create')" title="添加 MCP 服务器">
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
import { getToolCenterApi, type McpServerState } from '@/renderer/api/tool-center-api'
import { SaLoading, SaEmpty } from '@/renderer/components'
import ToolbarActions from '@/renderer/components/workspace/ToolbarActions.vue'

const router = useRouter()
const mcpApi = getToolCenterApi()

const servers = ref<McpServerState[]>([])
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    const state = await mcpApi.getState()
    servers.value = state.mcpServers
  } finally {
    loading.value = false
  }
}

async function onDelete(name: string) {
  await mcpApi.removeMcpServer(name)
  const state = await mcpApi.getState()
  servers.value = state.mcpServers
}

onMounted(load)
</script>

<style scoped>
.mcp-settings-page {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.mcp-settings-page__header {
  margin-bottom: 24px;
}

.mcp-settings-page__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
  margin-bottom: 8px;
}

.mcp-settings-page__desc {
  font-size: 13px;
  color: var(--sa-text-tertiary, #aeaeb2);
  line-height: 1.5;
}

/* 服务器卡片 */
.mcp-server-card {
  background: var(--sa-bg-primary, #fff);
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 12px;
}

.mcp-server-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.mcp-server-card__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
}

.mcp-server-card__transport {
  font-size: 12px;
  color: var(--sa-text-tertiary, #aeaeb2);
  margin-top: 2px;
  font-family: 'SF Mono', 'Menlo', monospace;
}

.mcp-server-card__status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
}
.status-dot.online { background: #34c759; }
.status-dot.offline { background: #aeaeb2; }

.mcp-server-card__tools {
  margin-top: 8px;
}

.mcp-server-card__tools-title {
  font-size: 12px;
  color: var(--sa-text-tertiary, #aeaeb2);
  margin-bottom: 8px;
}

.mcp-server-card__tool-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mcp-server-card__tool-tag {
  background: rgba(0, 122, 255, 0.08);
  color: var(--sa-accent, #007aff);
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 10px;
}

.mcp-server-card__tools-empty {
  font-size: 12px;
  color: var(--sa-warning, #ff9500);
  margin-top: 8px;
}

.mcp-server-card__error {
  margin-top: 8px;
  font-size: 12px;
  color: var(--sa-destructive, #ff3b30);
  background: rgba(255, 59, 48, 0.06);
  padding: 6px 10px;
  border-radius: 6px;
}

.mcp-server-card__actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}

.mcp-server-card__btn {
  font-size: 12px;
  padding: 4px 14px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-family: inherit;
  /* emil：指定属性过渡 + 强 ease-out + 按压 */
  transition: background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 150ms cubic-bezier(0.23, 1, 0.32, 1);
}

.mcp-server-card__btn--edit {
  background: rgba(0, 122, 255, 0.08);
  color: var(--sa-accent, #007aff);
}

.mcp-server-card__btn--delete {
  background: rgba(255, 59, 48, 0.08);
  color: var(--sa-destructive, #ff3b30);
}

/* ── 手机模式 ── */
@media (max-width: 767px) {
  .mcp-settings-page {
    padding: 16px 8px;
  }
}
</style>
