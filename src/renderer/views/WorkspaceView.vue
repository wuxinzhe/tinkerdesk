<template>
  <div class="workspace">
    <!-- ── 移动端顶栏 ── -->
    <WorkspaceToolbar
      class="workspace__mobile-bar"
      variant="mobile"
      :title="topbarTitle"
      :show-menu="!inDetail"
      :show-back="inDetail"
      :tool-calls="mobileToolCalls"
      :is-processing="chatStore.isProcessingBySession[sessionStore.sessionId ?? ''] ?? false"
      @back="goBack"
      @menu="drawerOpen = true"
    >
      <template #actions>
        <div id="mobile-toolbar-actions" />
      </template>
    </WorkspaceToolbar>

    <!-- ── 抽屉（移动端 + 平板端 Lv1） ── -->
    <MobileDrawer
      :open="drawerOpen"
      :active-tab="activeTab"
      @close="drawerOpen = false"
      @select="onNavSelect"
    />

    <!-- ── 一级：功能导航栏（桌面端 ≥1024px） ── -->
    <div class="workspace__sidebar">
      <NavSidebarComponent
        v-model:collapsed="navCollapsed"
        :active="activeTab"
        @select="onNavSelect"
      />
    </div>

    <!-- ── 二级 + 三级 ── -->
    <div class="workspace__main">
      <div
        class="workspace__l2-col"
        :class="{
          'workspace__l2-col--full': !hasLevel3,
          'workspace__l2-col--collapsed': sidebarCollapsed && activeTab === 'agent-chat'
        }"
      >
        <!-- 平板端 Lv2 顶部工具栏 -->
        <div class="workspace__lv2-toolbar">
          <button class="workspace__lv2-hamburger" @click="drawerOpen = true">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
          <h1 class="workspace__lv2-title">{{ lv2Title }}</h1>
        </div>
        <router-view name="level2" class="workspace__l2-router" />
      </div>

      <!-- ── 三级操作区 ── -->
      <div v-if="hasLevel3" class="workspace__l3-container">
        <WorkspaceToolbar
          class="workspace__l3-bar"
          variant="l3"
          :title="l3ToolbarTitle"
          :show-back="true"
          @back="goBack"
        >
          <template #actions>
            <div id="l3-toolbar-actions" />
          </template>
        </WorkspaceToolbar>
        <router-view name="level3" class="workspace__l3-col" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WorkspaceToolbar from '@/renderer/components/workspace/WorkspaceToolbar.vue'
import NavSidebarComponent from '@/renderer/components/workspace/NavSidebarComponent.vue'
import MobileDrawer from '@/renderer/components/workspace/MobileDrawer.vue'
import { useSessionStore } from '@/renderer/stores/session-store'
import { useChatStore } from '@/renderer/stores/chat-store'

const route = useRoute()
const router = useRouter()
const sessionStore = useSessionStore()
const chatStore = useChatStore()

/* ── 当前 tab（从路由路径提取） ── */
const activeTab = computed(() => {
  const path = route.path
  if (path.startsWith('/workspace/chat')) return 'agent-chat'
  if (path.startsWith('/workspace/agents') || path.startsWith('/workspace/agent')) return 'agents'
  if (path.startsWith('/workspace/settings')) return 'settings'
  if (path.startsWith('/workspace/workshop')) return 'workshop'
  return 'agent-chat'
})

/* ── 通用 hasLevel3 检测 ── */
const hasLevel3 = computed(() => {
  const matched = route.matched
  for (let i = matched.length - 1; i >= 0; i--) {
    const record = matched[i]
    const comps = record.components
    if (comps && typeof comps === 'object' && 'level3' in comps) {
      // 手机上占位 L3 不算，避免列表页被隐藏
      const isMobile = window.innerWidth < 768
      if (isMobile && record.meta?.level3Placeholder) return false
      return true
    }
  }
  return false
})

/* ── 状态 ── */
const navCollapsed = ref(false)
const drawerOpen = ref(false)
const sidebarCollapsed = ref(false)
provide('sidebar-collapsed', sidebarCollapsed)

/* ── 上下文检测：L2 = 汉堡菜单，L3 = 返回按钮 ── */
const inDetail = computed(() => hasLevel3.value)
const inConversationDetail = computed(() => route.path.includes('/conversation/'))

/** 从 path 中提取 agents 子页面类型（取代不存在的 route.params.subMode） */
function getAgentSubMode(): string | undefined {
  const segs = route.path.split('/')
  // /workspace/agents/:profile/{subMode}  → subMode = segs[4]
  // /workspace/agents/create               → segs[4] = undefined
  if (segs.length >= 5 && segs[1] === 'workspace' && segs[2] === 'agents') {
    return segs[4]
  }
  return undefined
}

/** 技能详情页标题：读列表页经 router.push({ state }) 传入的 skill 对象 */
function getSkillDetailTitle(): string {
  const s = (history.state as { skill?: { displayName?: string; name?: string } } | null)?.skill
  return s?.displayName || s?.name || '技能详情'
}

/* ── L3 工具栏标题 ── */
const l3ToolbarTitle = computed(() => {
  if (inConversationDetail.value) return '对话详情'

  if (activeTab.value === 'settings') {
    if (route.path.includes('/settings/model/create')) return '添加模型'
    if (route.path.includes('/settings/model/') && route.path.endsWith('/edit')) return '编辑模型'
    if (route.path.includes('/settings/mcp/create')) return '添加 MCP 服务器'
    if (route.path.includes('/settings/mcp/') && route.path.endsWith('/edit')) return '编辑 MCP 服务器'
    const section = route.params.section as string
    if (section === 'model') return '模型设置'
    if (section === 'mcp') return 'MCP 工具'
    if (section === 'plugins') return '插件设置'
    if (section === 'voice') return '语音设置'
    // 插件配置页（/settings/plugins/:pluginId）
    if (route.path.includes('/settings/plugins/')) return '插件配置'
    return '系统设置'
  }

  if (activeTab.value === 'agents') {
    const subMode = getAgentSubMode()
    if (subMode === 'edit') return '编辑 Agent'
    if (subMode === 'skills') return '技能管理'
    if (subMode === 'tools') return '工具配置'
    if (subMode === 'models') return '模型配置'
    if (subMode === 'market') return '技能市场'
    if (subMode === 'settings') return 'Agent 设置'
    if (subMode === 'prompt-modules') {
      if (route.path.endsWith('/create')) return '新增提示词模块'
      if (route.path.match(/\/prompt-modules\/\d+\/edit$/)) return '编辑提示词模块'
      return '提示词模块'
    }
    if (subMode === 'skill') {
      return getSkillDetailTitle()
    }
    if (route.path.includes('/agents/create')) return '创建 Agent'
  }

  if (activeTab.value === 'agent-chat') {
    if (route.path.includes('/history')) return '历史预览'
    return sessionStore.currentSession?.title || '对话'
  }

  if (activeTab.value === 'workshop') return '工坊'

  return ''
})

/* ── 移动端顶栏标题 ── */
const sessionTitle = computed(() => sessionStore.currentSession?.title ?? '')

const SECTION_TITLES: Record<string, string> = {
  model: '模型设置', mcp: 'MCP 工具', plugins: '插件设置', voice: '语音设置',
}
const AGENT_SUB_TITLES: Record<string, string> = {
  skills: '技能管理', tools: '工具配置',
  models: '模型配置', edit: '编辑 Agent',
  market: '技能市场', settings: 'Agent 设置', 'prompt-modules': '提示词模块',
}

const topbarTitle = computed(() => {
  if (inConversationDetail.value) return '对话详情'
  if (activeTab.value === 'settings') {
    if (route.path.includes('/settings/model/create')) return '添加模型'
    if (route.path.includes('/settings/model/') && route.path.endsWith('/edit')) return '编辑模型'
    if (route.path.includes('/settings/mcp/create')) return '添加 MCP 服务器'
    if (route.path.includes('/settings/mcp/') && route.path.endsWith('/edit')) return '编辑 MCP 服务器'
    const section = route.params.section as string
    if (section && SECTION_TITLES[section]) return SECTION_TITLES[section]
  }
  if (activeTab.value === 'agents') {
    const subMode = getAgentSubMode()
    if (subMode && AGENT_SUB_TITLES[subMode]) return AGENT_SUB_TITLES[subMode]
    if (subMode === 'skill') {
      return getSkillDetailTitle()
    }
    if (route.path.endsWith('/agents/create')) return '创建 Agent'
  }
  const map: Record<string, string> = {
    'agent-chat': sessionTitle.value || '对话',
    agents: 'Agents', settings: '系统设置', workshop: '工坊',
  }
  return map[activeTab.value] || ''
})

/** 平板端 Lv2 工具栏标题 */
const lv2Title = computed(() => {
  if (inConversationDetail.value) return '对话详情'
  const item = drawerNavItems.find(i => i.id === activeTab.value)
  return item?.label || ''
})

/** 移动端顶栏：当前 session 的工具调用进度 */
const mobileToolCalls = computed(() => {
  const sid = sessionStore.sessionId
  if (!sid || activeTab.value !== 'agent-chat') return []
  return chatStore.toolCallsBySession[sid] ?? []
})

/* ── 导航 ── */
const drawerNavItems = [
  { id: 'agent-chat', label: '对话', icon: '' },
  { id: 'agents', label: 'Agents', icon: '' },
  { id: 'workshop', label: '工坊', icon: '' },
  { id: 'settings', label: '系统设置', icon: '' },
]

function onNavSelect(id: string) {
  drawerOpen.value = false
  const pathMap: Record<string, string> = {
    'agent-chat': '/workspace/chat', agents: '/workspace/agents',
    settings: '/workspace/settings', workshop: '/workspace/workshop',
  }
  router.replace(pathMap[id] || '/workspace/chat')
}

function goBack() {
  // Agent 技能市场 → 返回技能管理子页
  if (activeTab.value === 'agents' && route.params.subMode === 'market') {
    router.push(`/workspace/agents/${route.params.profile}/skills`)
    return
  }
  if (window.history.length <= 1) {
    const fallback: Record<string, string> = {
      'agent-chat': '/workspace/chat',
      agents: '/workspace/agents',
      settings: '/workspace/settings',
      workshop: '/workspace/workshop',
    }
    router.push(fallback[activeTab.value] || '/workspace/chat')
    return
  }
  router.back()
}

/* ── Lifecycle ── */
onMounted(() => {
  nextTick(() => {
    const sessionId = route.query.session as string | undefined
    const tab = route.query.tab as string | undefined
    if (sessionId) {
      sessionStore.setSessionId(sessionId)
      router.replace({ path: `/workspace/chat/${sessionId}` })
    } else if (tab) {
      const pathMap: Record<string, string> = {
        agents: '/workspace/agents', settings: '/workspace/settings',
        workshop: '/workspace/workshop', skills: '/workspace/agents',
      }
      router.replace(pathMap[tab] || '/workspace/chat')
    }
  })
})
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════
   Workspace 布局 — 纯 CSS 响应式
   ═══════════════════════════════════════════════════════ */

.workspace {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: linear-gradient(180deg, #fafafa 0%, #f5f5f7 100%);
  border-top: 1px solid var(--sa-border, #d2d2d7);
}

.workspace__main {
  flex: 1;
  display: flex;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

/* ── 一级：默认隐藏，只在桌面端显示 ── */

.workspace__sidebar {
  display: none;
}

/* ── 顶栏可见性（纯 CSS 控制） ── */

.workspace__mobile-bar {
  display: none;
}

.workspace__l3-bar {
  display: none;
}

/* ── Lv2 列 ── */

.workspace__l2-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.workspace__l2-col--full {
  flex: 1;
  min-width: 0;
  display: flex;
  background: var(--sa-bg-primary, #ffffff);
}

.workspace__l2-col--collapsed {
  width: 0 !important;
  overflow: visible;
}

/* ── Lv3 列 ── */

.workspace__l3-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.workspace__l3-col {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  container-type: inline-size;
  container-name: l3-content;
  background: var(--sa-bg-primary, #ffffff);
}

/* ── Lv2 工具栏（仅平板端可见） ── */

.workspace__lv2-toolbar {
  display: none;
  align-items: center;
  padding: 10px 12px;
  height: 44px;
  box-sizing: border-box;
  background: #ffffff;
  border-bottom: 1px solid var(--sa-border, #d2d2d7);
  flex-shrink: 0;
  position: relative;
  z-index: 100;
}

.workspace__l2-router {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.workspace__lv2-hamburger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: var(--sa-text-secondary, #86868b);
  flex-shrink: 0;
  position: absolute;
  left: 12px;
}

.workspace__lv2-hamburger:hover {
  background: var(--sa-bg-secondary, #f5f5f7);
}

.workspace__lv2-hamburger svg {
  width: 18px;
  height: 18px;
}

.workspace__lv2-title {
  flex: 1;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0 40px;
}

/* ═══════════════════════════════════════════════════════
   响应式断点
   ═══════════════════════════════════════════════════════ */

/* ── 移动端 <768px ── */
@media (max-width: 767px) {
  .workspace {
    flex-direction: column;
    border-top: none;
  }

  .workspace__mobile-bar {
    display: flex;
  }

  .workspace__main {
    flex: 1;
    position: relative;
  }

  .workspace__l2-col:not(.workspace__l2-col--full) {
    display: none;
  }
  .workspace__l2-col--full {
    display: flex;
  }

  .workspace__l3-col {
    display: flex;
  }

  .workspace__lv2-toolbar {
    display: none;
  }
}

/* ── 平板 768–1023px ── */
@media (min-width: 768px) and (max-width: 1023px) {
  .workspace__l2-col {
    width: 280px;
    flex-shrink: 0;
    border-right: 1px solid var(--sa-border, #d2d2d7);
    background: var(--sa-bg-primary, #ffffff);
  }

  .workspace__l3-col {
    display: flex;
  }

  .workspace__l3-bar {
    display: flex;
  }

  .workspace__lv2-toolbar {
    display: flex;
  }
}

/* ── 桌面端 ≥1024px ── */
@media (min-width: 1024px) {
  .workspace__sidebar {
    display: flex;
  }

  .workspace__l2-col {
    width: 280px;
    flex-shrink: 0;
    border-right: 1px solid var(--sa-border, #d2d2d7);
    background: var(--sa-bg-primary, #ffffff);
  }

  .workspace__l3-col {
    display: flex;
  }

  .workspace__l3-bar {
    display: flex;
  }

  .workspace__lv2-toolbar {
    display: none;
  }
}
</style>
