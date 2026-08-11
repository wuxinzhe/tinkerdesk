<template>
  <L3PageLayout class="tools-manage">
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><path d=&quot;M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z&quot;/></svg>"
      gradient="linear-gradient(135deg, #4d9fff 0%, var(--tk-accent) 100%)"
      title="工具配置"
      desc="启用/停用该 Agent 可用的工具"
    />
    <!-- Tab 页签：按工具类型分类（始终显示——空分类也保留 Tab 切换） -->
    <div class="tools-tabs">
      <button
        v-for="tab in toolTabs"
        :key="tab.type"
        class="tools-tab"
        :class="{ 'tools-tab--active': activeToolType === tab.type }"
        @click="switchTab(tab.type)"
      >
        {{ tab.label }}
      </button>
    </div>
    <div v-if="toolsLoading" class="tools-loading">
      加载中…
    </div>
    <div v-else-if="toolsList.length === 0" class="tools-empty">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
      </svg>
      <p>暂无可用工具</p>
    </div>
    <div v-else>
      <div class="tools-list">
        <div v-for="tool in toolsList" :key="tool.name" class="tool-row" :class="{ 'tool-row--unavailable': !!tool.error }">
          <div class="tool-row__info">
            <div class="tool-row__header">
              <span class="tool-row__tag" :class="'tag-' + (tool.toolType || 'unknown')">
                {{ toolTypeLabels[tool.toolType || ''] || '未知来源' }}
              </span>
              <div class="tool-row__name">
                {{ parseDisplayName(tool.name) }}
              </div>
              <button
                class="tool-row__settings-btn"
                title="工具设置"
                @click="openToolSettings(tool)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </button>
            </div>
            <div class="tool-row__desc">
              {{ tool.description || '暂无描述' }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { L3PageLayout, SaPageHero } from '@/renderer/components'
import type { ToolItem } from '@/renderer/api/types'
import { parseDisplayName } from '@/renderer/utils/tool-name'
import { toolsApi } from '@/renderer/api/tools-api'

const route = useRoute()
const router = useRouter()

const detailProfile = computed(() => route.params.profile as string)

/* ── Tools state ── */
const toolsList = ref<ToolItem[]>([])
const toolsLoading = ref(false)

/* ── Tab 页签（按工具类型分类查询） ── */
const toolTabs = [
  { type: 'builtin', label: '内建工具' },
  { type: 'desktop', label: '插件工具' },
  { type: 'mcp', label: 'MCP 工具' },
]
const activeToolType = ref('builtin')

const toolTypeLabels: Record<string, string> = {
  builtin: '内建工具', desktop: '插件工具', client: '客户端工具', mcp: 'MCP 工具',
}

function switchTab(type: string): void {
  if (activeToolType.value === type) return
  activeToolType.value = type
  void loadTools()
}

async function loadTools() {
  const profile = detailProfile.value
  if (!profile) return
  toolsLoading.value = true
  try {
    const res = await toolsApi.list(profile, activeToolType.value)
    toolsList.value = res ?? []
  } catch {
    toolsList.value = []
  } finally {
    toolsLoading.value = false
  }
}

/** 打开工具设置 L3 页（每工具可进——含 Provider 配置/描述/错误/黑名单开关） */
function openToolSettings(tool: ToolItem) {
  router.push(`/workspace/agents/${detailProfile.value}/tools/${encodeURIComponent(tool.name)}/provider`)
}

watch(() => route.params.profile, () => loadTools())

onMounted(() => loadTools())
</script>

<style scoped>
/* 窄列布局（与系统设置 L3 对齐：680px 宽，靠左） */
.tools-manage {
  max-width: 680px;
  width: 100%;
}
.tools-loading,
.tools-empty {
  text-align: center;
  padding: 40px;
  color: var(--tk-text-tertiary);
  font-size: 13px;
}
.tools-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tool-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tk-text-secondary);
  letter-spacing: 0.3px;
}
.tool-group-header__count {
  font-weight: 400;
  color: var(--tk-text-tertiary);
}
.tool-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--tk-border);
  border-radius: 8px;
  /* 卡片辨识度：白底（深色 elevated）+ 轻阴影，与页面背景区分 */
  background: var(--tk-bg-elevated);
  box-shadow: var(--tk-shadow-sm);
  transition: border-color 0.12s, box-shadow 0.12s;
}
.tool-row:hover {
  border-color: var(--tk-accent);
  box-shadow: var(--tk-shadow-md);
}
.tool-row__info {
  flex: 1;
  min-width: 0;
}
.tool-row__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.tool-row__tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 500;
  flex-shrink: 0;
}
.tag-builtin { background: #e8f5e9; color: #2e7d32; }
.tag-desktop { background: #e3f2fd; color: #1565c0; }
.tag-client { background: #f3e5f5; color: #7b1fa2; }
.tag-mcp { background: #fff3e0; color: #e65100; }
.tag-unknown { background: #eceff1; color: #546e7a; }
.tool-row__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--tk-text-primary);
}
.tool-row__desc {
  font-size: 12px;
  color: var(--tk-text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.tool-row__desc::-webkit-scrollbar {
  display: none;
}
.tool-row__checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  flex-shrink: 0;
  margin-left: auto;
}
.tool-row__checkbox input { display: none; }
.tool-row__checkbox-visual {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--tk-bg-tertiary);
  position: relative;
  transition: background 0.15s;
}
.tool-row__checkbox-visual::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0,0,0,0.15);
  transition: transform 0.15s;
}
.tool-row__checkbox.checked .tool-row__checkbox-visual {
  background: var(--tk-success);
}
.tool-row__checkbox.checked .tool-row__checkbox-visual::after {
  transform: translateX(16px);
}
.tool-row__checkbox-text {
  font-size: 12px;
  color: var(--tk-text-tertiary);
}
.tool-row__provider-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--tk-text-tertiary);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.tool-row__provider-btn:hover {
  color: var(--tk-accent);
  background: rgba(10, 132, 255, 0.08);
}

/* ── Tab 页签（内建/桌面/MCP 分类） ── */
.tools-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  padding: 0 12px;
}
.tools-tab {
  padding: 6px 16px;
  border: 1px solid var(--tk-border);
  border-radius: 999px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 150ms, color 150ms, background 150ms;
}
.tools-tab:hover {
  border-color: var(--tk-accent);
  color: var(--tk-text-primary);
}
.tools-tab--active {
  border-color: var(--tk-accent);
  background: rgba(10, 132, 255, 0.1);
  color: var(--tk-accent);
}

/* 不可用工具：整行灰色 */
.tool-row--unavailable .tool-row__info {
  opacity: 0.45;
}
.tool-row--unavailable .tool-row__name {
  text-decoration: line-through;
}

/* 设置按钮（每工具可进——替代黑名单开关；靠右对齐） */
.tool-row__settings-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: auto;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--tk-text-tertiary);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.tool-row__settings-btn:hover {
  color: var(--tk-accent);
  background: rgba(10, 132, 255, 0.08);
}
</style>
