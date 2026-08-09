<template>
  <L3PageLayout class="tools-manage">
    <div v-if="toolsLoading" class="tools-loading">加载中…</div>
    <div v-else-if="toolsList.length === 0" class="tools-empty">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
      </svg>
      <p>暂无可用工具</p>
    </div>
    <div v-else class="tools-list">
      <template v-for="group in groupedTools" :key="group.toolType">
        <div class="tool-group-header">
          <span class="tool-group-header__label">{{ group.label }}</span>
          <span class="tool-group-header__count">{{ group.tools.length }} 个</span>
        </div>
        <div v-for="tool in group.tools" :key="tool.name" class="tool-row">
          <div class="tool-row__info">
            <div class="tool-row__header">
              <span class="tool-row__tag" :class="'tag-' + (tool.toolType || 'unknown')">
                {{ toolTypeLabels[tool.toolType || ''] || '未知来源' }}
              </span>
              <div class="tool-row__name">{{ parseDisplayName(tool.name) }}</div>
              <button
                v-if="tool.supportsProvider"
                class="tool-row__provider-btn"
                title="Provider 设置"
                @click="openProviderSettings(tool)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </button>
              <label class="tool-row__checkbox" :class="{ checked: !tool.disabled }">
                <input
                  type="checkbox"
                  :checked="!tool.disabled"
                  :disabled="toolsToggling.has(tool.name)"
                  @change="toggleTool(tool)"
                />
                <span class="tool-row__checkbox-visual"></span>
              </label>
            </div>
            <div class="tool-row__desc">{{ tool.description || '暂无描述' }}</div>
          </div>
        </div>
      </template>
    </div>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { L3PageLayout } from '@/renderer/components'
import type { ToolItem } from '@/renderer/api/types'
import { parseDisplayName } from '@/renderer/utils/tool-name'
import { toolsApi } from '@/renderer/api/tools-api'

const route = useRoute()
const router = useRouter()

const detailProfile = computed(() => route.params.profile as string)

/* ── Tools state ── */
const toolsList = ref<ToolItem[]>([])
const toolsLoading = ref(false)
const toolsToggling = ref(new Set<string>())

const toolTypeOrder = ['server', 'desktop', 'shared', 'web', 'mcp-ext', 'web-ext', 'iPhone', 'Android']
const toolTypeLabels: Record<string, string> = {
  server: '服务端内建', desktop: '桌面端', shared: '双端通用', web: '浏览器端',
  'mcp-ext': 'MCP 外部工具', 'web-ext': '浏览器扩展',
  iPhone: 'iPhone 端', Android: 'Android 端'
}

const groupedTools = computed(() => {
  const groups = new Map<string, ToolItem[]>()
  for (const tool of toolsList.value) {
    const tt = tool.toolType || 'server'
    if (!groups.has(tt)) groups.set(tt, [])
    groups.get(tt)!.push(tool)
  }
  const result: Array<{ toolType: string; label: string; tools: ToolItem[] }> = []
  for (const tt of toolTypeOrder) {
    const tools = groups.get(tt)
    if (tools) result.push({ toolType: tt, label: toolTypeLabels[tt] || tt, tools })
  }
  for (const [tt, tools] of groups) {
    if (!toolTypeOrder.includes(tt)) result.push({ toolType: tt, label: toolTypeLabels[tt] || tt, tools })
  }
  return result
})

async function loadTools() {
  const profile = detailProfile.value
  if (!profile) return
  toolsLoading.value = true
  try {
    const res = await toolsApi.list(profile)
    toolsList.value = res ?? []
  } catch {
    toolsList.value = []
  } finally {
    toolsLoading.value = false
  }
}

/** 打开工具的 provider 设置 L3 页（仅 supportsProvider 的工具显示按钮） */
function openProviderSettings(tool: ToolItem) {
  router.push(`/workspace/agents/${detailProfile.value}/tools/${encodeURIComponent(tool.name)}/provider`)
}

async function toggleTool(tool: ToolItem) {
  if (!detailProfile.value || toolsToggling.value.has(tool.name)) return
  toolsToggling.value = new Set(toolsToggling.value).add(tool.name)
  try {
    const newDisabled = !tool.disabled
    await toolsApi.toggle(tool.name, newDisabled, detailProfile.value)
    tool.disabled = newDisabled
  } catch { /* silent */ } finally {
    const next = new Set(toolsToggling.value)
    next.delete(tool.name)
    toolsToggling.value = next
  }
}

watch(() => route.params.profile, () => loadTools())

onMounted(() => loadTools())
</script>

<style scoped>
.tools-loading,
.tools-empty {
  text-align: center;
  padding: 40px;
  color: var(--sa-text-tertiary, #aeaeb2);
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
  color: var(--sa-text-secondary, #86868b);
  letter-spacing: 0.3px;
}
.tool-group-header__count {
  font-weight: 400;
  color: var(--sa-text-tertiary, #aeaeb2);
}
.tool-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 8px;
  /* 卡片辨识度：白底（深色 elevated）+ 轻阴影，与页面背景区分 */
  background: var(--sa-bg-elevated, #ffffff);
  box-shadow: var(--sa-shadow-sm);
  transition: border-color 0.12s, box-shadow 0.12s;
}
.tool-row:hover {
  border-color: var(--sa-accent, #007aff);
  box-shadow: var(--sa-shadow-md);
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
.tag-server { background: #e8f5e9; color: #2e7d32; }
.tag-desktop { background: #e3f2fd; color: #1565c0; }
.tag-shared { background: #f3e5f5; color: #7b1fa2; }
.tag-web { background: #fff3e0; color: #e65100; }
.tool-row__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--sa-text-primary, #1d1d1f);
}
.tool-row__desc {
  font-size: 12px;
  color: var(--sa-text-secondary, #86868b);
  max-height: 7.8em;
  overflow: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
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
  background: #e5e5ea;
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
  background: #34c759;
}
.tool-row__checkbox.checked .tool-row__checkbox-visual::after {
  transform: translateX(16px);
}
.tool-row__checkbox-text {
  font-size: 12px;
  color: var(--sa-text-tertiary, #aeaeb2);
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
  color: var(--sa-text-tertiary, #aeaeb2);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.tool-row__provider-btn:hover {
  color: var(--sa-accent, #0a84ff);
  background: rgba(10, 132, 255, 0.08);
}
</style>
