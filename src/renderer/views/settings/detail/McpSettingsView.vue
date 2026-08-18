<template>
  <L3PageLayout class="mcp-settings-page">
    <div class="mcp-settings-page__body">
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><path d=&quot;M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z&quot;/></svg>"
      gradient="linear-gradient(135deg, #52e57f 0%, var(--tk-success) 100%)"
      title="MCP 工具"
      desc="管理通过 MCP 协议接入的第三方工具"
    />

    <!-- 页头动作：添加 MCP 服务器（参考扩展设置按钮位置——页头右侧） -->
    <div class="mcp-settings-page__header">
      <button class="page-action-btn" title="添加 MCP 服务器" @click="router.push('/workspace/settings/mcp/create')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        添加 MCP 工具
      </button>
    </div>

    <!-- 服务器列表 -->
    <div class="mcp-settings-page__list">
      <SaLoading v-if="loading" size="small" />

      <SaEmpty v-else-if="servers.length === 0" icon="box" text="尚未配置 MCP 服务器。" hint="点击右上角 + 按钮添加一个 stdio 或 HTTP 类型的 MCP 服务器。" />

      <div v-for="server in servers" :key="server.name" class="mcp-server-card">
        <div class="mcp-server-card__header">
          <div class="mcp-server-card__info">
            <div class="mcp-server-card__name">
              {{ server.name }}
            </div>
            <div class="mcp-server-card__transport">
              {{ server.transport === 'stdio' ? server.command : server.url }}
            </div>
          </div>
          <div class="mcp-server-card__status">
            <span :class="['status-dot', server.connected ? 'online' : 'offline']"></span>
            {{ server.connected ? '已连接' : '未连接' }}
          </div>
        </div>

        <!-- 工具列表 -->
        <div v-if="server.tools && server.tools.length > 0" class="mcp-server-card__tools">
          <div class="mcp-server-card__tools-title">
            工具 ({{ server.tools.length }})：
          </div>
          <div class="mcp-server-card__tool-tags">
            <span v-for="tool in server.tools" :key="tool.name" class="mcp-server-card__tool-tag">
              {{ tool.name }}
            </span>
          </div>
        </div>
        <div v-else-if="server.connected && server.tools.length === 0" class="mcp-server-card__tools-empty">
          已连接但未发现工具
        </div>

        <div v-if="server.error" class="mcp-server-card__error">
          {{ server.error }}
        </div>

        <div class="mcp-server-card__actions">
          <button class="mcp-server-card__btn mcp-server-card__btn--edit" @click="router.push('/workspace/settings/mcp/' + encodeURIComponent(server.name) + '/edit')">
            编辑
          </button>
          <button class="mcp-server-card__btn mcp-server-card__btn--delete" @click="onDelete(server.name)">
            删除
          </button>
        </div>
      </div>
    </div>
    </div>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getToolCenterApi, type McpServerState } from '@/renderer/api/tool-center-api'
import { SaLoading, SaEmpty, SaPageHero , L3PageLayout } from '@/renderer/components'

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
  
    width: 100%;
}

.mcp-settings-page__header {
  display: flex;
  justify-content: flex-end;
  margin: 12px 0 4px;
}

/* 页头动作按钮（参考扩展设置安装按钮——accent 风格） */
.page-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: #fff;
  background: var(--tk-accent);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 160ms cubic-bezier(0.23, 1, 0.32, 1), transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.page-action-btn:active { transform: scale(0.97); }
@media (hover: hover) and (pointer: fine) {
  .page-action-btn:hover { background: rgba(0, 122, 255, 0.88); }
}

.mcp-settings-page__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--tk-text-primary);
  margin-bottom: 8px;
}

.mcp-settings-page__desc {
  font-size: 13px;
  color: var(--tk-text-tertiary);
  line-height: 1.5;
}

/* 服务器卡片 */
.mcp-server-card {
  background: var(--tk-bg-primary);
  /* emil：大圆角 + 分层阴影 */
  border: 1px solid var(--tk-border-card);
  border-radius: var(--tk-radius-xl);
  box-shadow: var(--tk-shadow-card);
  padding: 18px;
  margin-bottom: 12px;
  transition: box-shadow 200ms cubic-bezier(0.23, 1, 0.32, 1);
}
@media (hover: hover) and (pointer: fine) {
  .mcp-server-card:hover {
    box-shadow: var(--tk-shadow-card-hover);
  }
}

.mcp-server-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.mcp-server-card__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--tk-text-primary);
}

.mcp-server-card__transport {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  margin-top: 2px;
  font-family: 'SF Mono', 'Menlo', monospace;
}

.mcp-server-card__status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--tk-text-tertiary);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
}
.status-dot.online { background: var(--tk-success); }
.status-dot.offline { background: var(--tk-text-quaternary); }

.mcp-server-card__tools {
  margin-top: 8px;
}

.mcp-server-card__tools-title {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  margin-bottom: 8px;
}

.mcp-server-card__tool-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mcp-server-card__tool-tag {
  background: rgba(0, 122, 255, 0.08);
  color: var(--tk-accent);
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 10px;
}

.mcp-server-card__tools-empty {
  font-size: 12px;
  color: var(--tk-warning);
  margin-top: 8px;
}

.mcp-server-card__error {
  margin-top: 8px;
  font-size: 12px;
  color: var(--tk-destructive);
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
  color: var(--tk-accent);
}

.mcp-server-card__btn--delete {
  background: rgba(255, 59, 48, 0.08);
  color: var(--tk-destructive);
}

/* ── 手机模式 ── */
@media (max-width: 767px) {
  .mcp-settings-page {
    
  }
}
</style>
