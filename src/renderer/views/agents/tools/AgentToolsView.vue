<template>
  <L3PageLayout class="tools-manage" wide>
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><path d=&quot;M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z&quot;/></svg>"
      gradient="linear-gradient(135deg, #4d9fff 0%, var(--tk-accent) 100%)"
      title="工具配置"
      desc="启用/停用该 Agent 可用的工具"
    />
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
      <div class="tool-tabs" role="tablist">
        <button
          class="tool-tab"
          :class="{ 'tool-tab--active': activeSource === 'builtin' }"
          role="tab"
          :aria-selected="activeSource === 'builtin'"
          @click="activeSource = 'builtin'"
        >
          内置
          <span class="tool-tab__count">{{ builtinTools.length }}</span>
        </button>
        <button
          class="tool-tab"
          :class="{ 'tool-tab--active': activeSource === 'external' }"
          role="tab"
          :aria-selected="activeSource === 'external'"
          @click="activeSource = 'external'"
        >
          扩展
          <span class="tool-tab__count">{{ externalTools.length }}</span>
        </button>
      </div>

      <div v-if="visibleTools.length > 0" class="tool-cards">
        <div
          v-for="tool in visibleTools"
          :key="tool.name"
          class="tool-card"
          :class="{ 'tool-card--unavailable': !!tool.error }"
          :title="tool.error ? tool.error : `点击进入 ${tool.name} 配置`"
          @click="openToolSettings(tool)"
        >
          <div class="tool-card__top">
            <div class="tool-card__name">{{ parseDisplayName(tool.name) }}</div>
            <!-- creator 模式：授权开关（editable=true 时显示——其余模式只读） -->
            <label v-if="tool.editable" class="tool-auth" :title="tool.authorized ? '已授权该 Agent' : '未授权'" @click.stop>
              <input
                type="checkbox"
                :checked="tool.authorized"
                :disabled="!!tool.error"
                @change="toggleAuthorize(tool)"
              />
              <span class="tool-auth__slider"></span>
            </label>
            <span v-else class="tool-auth__readonly" title="当前模式固定工具集，不可编辑">只读</span>
          </div>
          <div class="tool-card__desc">{{ tool.description || '暂无描述' }}</div>
          <div class="tool-card__foot">
            <span class="tool-card__source">{{ tool.source === 'external' ? '扩展' : '内置' }}</span>
            <span v-if="tool.error" class="tool-card__err">不可用</span>
          </div>
        </div>
      </div>
      <div v-else class="tools-empty">暂无{{ activeSource === 'external' ? '扩展' : '内置' }}工具</div>
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

/* ── 内置 / 扩展 Tab 分组（按 source） ── */
const activeSource = ref<'builtin' | 'external'>('builtin')
const builtinTools = computed(() => toolsList.value.filter((t) => t.source !== 'external'))
const externalTools = computed(() => toolsList.value.filter((t) => t.source === 'external'))
const visibleTools = computed(() => (activeSource.value === 'external' ? externalTools.value : builtinTools.value))


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

/** 打开工具设置 L3 页（每工具可进——含 Provider 配置/描述/错误/黑名单开关） */
function openToolSettings(tool: ToolItem) {
  router.push(`/workspace/agents/${detailProfile.value}/tools/${encodeURIComponent(tool.name)}/provider`)
}

/** creator 模式：切换该工具授权（agent_tools authorize/revoke）——只读模式后端拒绝 */
async function toggleAuthorize(tool: ToolItem) {
  if (!tool.editable) return
  const profile = detailProfile.value
  if (!profile) return
  const res = await toolsApi.toggle(tool.name, !tool.authorized, profile)
  if (res.success) {
    tool.authorized = !tool.authorized
  }
  window.dispatchEvent(new CustomEvent('global-tip', {
    detail: {
      type: res.success ? 'success' : 'error',
      code: 'tools:authorize',
      message: res.success ? `已${tool.authorized ? '授权' : '移除授权'} ${tool.name}` : (res.error || '操作失败'),
    },
  }))
}

watch(() => route.params.profile, () => loadTools())

onMounted(() => loadTools())
</script>

<style scoped>
/* 窄列布局（与系统设置 L3 对齐：680px 宽，靠左） */
.tools-manage {
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
/* ── 内置 / 扩展 Tab ── */
.tool-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--tk-border);
}
.tool-tab {
  position: relative;
  padding: 8px 14px;
  font-size: 13px;
  color: var(--tk-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.18s;
}
.tool-tab:hover {
  color: var(--tk-text-primary);
}
.tool-tab--active {
  color: var(--tk-accent);
  font-weight: 600;
}
.tool-tab--active::after {
  content: '';
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: -1px;
  height: 2px;
  border-radius: 2px;
  background: var(--tk-accent);
}
.tool-tab__count {
  margin-left: 5px;
  font-size: 12px;
  font-weight: 400;
  color: var(--tk-text-tertiary);
}
/* ── 工具卡片网格 ── */
.tool-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 10px;
}
.tool-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--tk-border);
  border-radius: 10px;
  background: var(--tk-card-bg);
  cursor: pointer;
  transition: border-color 0.18s, box-shadow 0.18s, transform 0.12s;
}
.tool-card:hover {
  border-color: var(--tk-accent);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
.tool-card:active {
  transform: scale(0.985);
}
.tool-card--unavailable {
  opacity: 0.65;
}
.tool-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.tool-card__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--tk-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tool-card__desc {
  flex: 1;
  font-size: 12px;
  line-height: 1.5;
  color: var(--tk-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.tool-card__foot {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tool-card__source {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 99px;
  background: var(--tk-bg-hover, rgba(127, 127, 127, 0.1));
  color: var(--tk-text-tertiary);
}
.tool-card__err {
  font-size: 11px;
  color: #e5484d;
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
.tool-row__desc {
  /* 滚动条全局统一（variables.css 3px 圆角） */
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

/* ── Tab 页签（内建/桌面分类） ── */
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

/* ── creator 授权开关（editable 模式）── */
.tool-auth {
  position: relative;
  flex-shrink: 0;
  width: 32px;
  height: 18px;
  cursor: pointer;
}
.tool-auth input {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
}
.tool-auth__slider {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: var(--tk-border);
  transition: background 0.15s;
}
.tool-auth__slider::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}
.tool-auth input:checked + .tool-auth__slider {
  background: var(--tk-accent);
}
.tool-auth input:checked + .tool-auth__slider::before {
  transform: translateX(14px);
}
.tool-auth input:disabled + .tool-auth__slider {
  opacity: 0.4;
  cursor: not-allowed;
}
.tool-auth__readonly {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--tk-text-tertiary);
  padding: 2px 8px;
  border: 1px solid var(--tk-border);
  border-radius: 6px;
}
</style>
