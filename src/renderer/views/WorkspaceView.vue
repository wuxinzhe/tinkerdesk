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
          'workspace__l2-col--collapsed': sidebarCollapsed
        }"
      >
        <!-- 内容层：独立 overflow:hidden 裁剪（折叠时内容裁掉） -->
        <div class="workspace__l2-inner">
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
      </div>

      <!-- ── 三级操作区 ── -->
      <div v-if="hasLevel3" class="workspace__l3-container">
        <!-- 工坊页不渲染全局 toolbar（工坊 UI 自带导航，避免双头部） -->
        <WorkspaceToolbar
          v-if="activeTab !== 'workshop'"
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
        <!-- L3 页面：key=fullPath——切换 agent（profile 参数变）强制重建，避免组件复用不刷新 -->
        <router-view
          name="level3"
          :key="$route.fullPath"
          class="workspace__l3-col"
        />
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
const navCollapsed = ref(true)
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
    if (section === 'general') return '通用设置'
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
      // 技能文件新增/编辑页
      if (route.path.match(/\/file\/new$/)) return '新增文件'
      if (route.path.match(/\/file\/\d+$/)) return '编辑文件'
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
  model: '模型设置', mcp: 'MCP 工具', plugins: '插件设置', voice: '语音设置', general: '通用设置',
}
const AGENT_SUB_TITLES: Record<string, string> = {
  skills: '技能管理', tools: '工具配置',
  models: '模型配置', edit: '编辑 Agent',
  market: '技能市场', settings: 'Agent 设置', 'prompt-modules': '提示词模块',
  memory: '记忆管理',
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
      // 技能文件新增/编辑页
      if (route.path.match(/\/file\/new$/)) return '新增文件'
      if (route.path.match(/\/file\/\d+$/)) return '编辑文件'
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
/** 顶部 TitleBar 折叠按钮 → 切换 lv2 列（原 sidebar-toggle 控制移到这里） */
function onToggleSidebar(): void {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

onMounted(() => {
  window.addEventListener('toggle-sidebar', onToggleSidebar)
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

onUnmounted(() => {
  window.removeEventListener('toggle-sidebar', onToggleSidebar)
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
  /* 浅色渐变——为毛玻璃 blur 提供可穿透内容 */
  background: linear-gradient(180deg, var(--tk-bg-secondary) 0%, #e9e9ef 100%);
  border-top: 1px solid var(--tk-border);
}

/* 深色：带蓝紫调的渐变（玻璃背后有色彩层次，blur 才可见） */
html[data-theme='dark'] .workspace {
  background: linear-gradient(180deg, #1d1d26 0%, #26262f 100%);
}

.workspace__main {
  flex: 1;
  display: flex;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  position: relative;
}

/* ── 一级：默认隐藏，只在桌面端显示 ── */

.workspace__sidebar {
  display: none;
  /* Liquid Glass（功能层——lv1 图标栏：玻璃 + 右侧边缘） */
  background: var(--tk-bg-glass);
  -webkit-backdrop-filter: blur(30px) saturate(200%);
  backdrop-filter: blur(30px) saturate(200%);
  border-right: 0.5px solid var(--tk-border);
  box-shadow: inset -0.5px 0 0 var(--tk-glass-edge);
}

/* ── 顶栏可见性（纯 CSS 控制） ── */

.workspace__mobile-bar {
  display: none;
  /* Liquid Glass（功能层——移动顶栏） */
  background: var(--tk-bg-glass);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  box-shadow: var(--tk-shadow-hairline);
}

.workspace__l3-bar {
  display: none;
  /* Liquid Glass（功能层——l3 工具条：玻璃 + 顶部高光边缘 + hairline） */
  background: var(--tk-bg-glass);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  box-shadow:
    0 0.5px 0 var(--tk-glass-edge);
}

/* ── Lv2 列 ── */

.workspace__l2-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
  /* 折叠动画统一在外层容器实现（子组件不再自实现） */
  transition: width 0.2s ease;
}

/* ── Lv2 工具栏（仅平板端可见） ── */

.workspace__lv2-toolbar {
  display: none;
  align-items: center;
  padding: 10px 12px;
  height: 44px;
  box-sizing: border-box;
  background: var(--tk-bg-glass);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  box-shadow: var(--tk-shadow-hairline);
  flex-shrink: 0;
  position: relative;
  z-index: 100;
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
  color: var(--tk-text-secondary);
  flex-shrink: 0;
  position: absolute;
  left: 12px;
}

.workspace__lv2-hamburger:hover {
  background: var(--tk-bg-secondary);
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
  color: var(--tk-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0 40px;
}

/* 内容层：flex 布局 + overflow 裁剪（折叠时内容裁掉）；自身淡出动画 */
.workspace__l2-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  transition: opacity 0.2s ease;
}

/* 内容保持自然宽度：列折叠收缩时内容宽度不随容器重排（min-width 固定），
   只被 inner 边界裁剪 + 淡出——避免 AgentList/Settings 等列表被挤压 */
.workspace__l2-inner > * {
  flex-shrink: 0;
  min-width: 280px;
}

.workspace__l2-col--collapsed .workspace__l2-inner {
  opacity: 0;
  pointer-events: none;
}

.workspace__l2-col--full {
  flex: 1;
  min-width: 0;
  display: flex;
  background: var(--tk-bg-primary);
}

.workspace__l2-col--collapsed {
  width: 0 !important;
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
  /* 透明——露出 workspace 渐变，玻璃工具条 blur 才有内容可透 */
  background: transparent;
}

/* ── Lv2 内容路由区 ── */

.workspace__l2-router {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
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
    border-right: 1px solid var(--tk-border);
    background: var(--tk-bg-primary);
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

  /* 平板折叠后列左边缘=视口左边缘（lv1 已隐藏）——
     按钮改为贴屏幕左边缘内侧（left:0），不随 right:0 溢出屏外 */
  .sidebar-toggle.collapsed {
    left: 0;
    right: auto;
    transform: translateY(-50%) translateX(0);
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
    border-right: 1px solid var(--tk-border);
    background: var(--tk-bg-primary);
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
