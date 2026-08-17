<template>
  <div class="workspace">
    <!-- ── 移动端顶栏 ── -->
    <WorkspaceToolbar class="workspace__mobile-bar" variant="mobile" :title="topbarTitle" :show-back="inDetail"
      :tool-calls="mobileToolCalls"
      :is-processing="chatStore.isProcessingBySession[sessionStore.sessionId ?? ''] ?? false" @back="goBack">
      <template #actions>
        <div id="mobile-toolbar-actions" />
      </template>
    </WorkspaceToolbar>

    <!-- ── 二级 + 三级 ── -->
        <div class="workspace__main" :class="{ 'workspace__main--col-collapsed': sidebarCollapsed }">
      <div class="workspace__sidebar-col" :class="{
        'workspace__sidebar-col--full': !hasLevel3,
        'workspace__sidebar-col--collapsed': sidebarCollapsed
      }">
        <!-- 内容层：独立 overflow:hidden 裁剪（折叠时内容裁掉） -->
        <div class="workspace__sidebar-inner">
          <!-- 平板端 Lv2 顶部工具栏 -->
          <div class="workspace__lv2-toolbar">
            <h1 class="workspace__lv2-title">
              {{ lv2Title }}
            </h1>
          </div>
          <!-- 全局 AgentCard（L2 顶部固定——所有模块显示当前 agent） -->
          <AgentCard v-if="agent" :agent="agent" :thinking-active="globalThinking" @switch-agent="goAgentList"
            @go-sidebar="switchSidebar" class="workspace__sidebar-agent" />
          <router-view name="sidebar" class="workspace__sidebar-router" v-if="false" />
          <!-- 侧边栏（功能驱动动态组件——与工作区解耦：切换功能只换侧边栏列表） -->
          <component :is="sidebarComponent" class="workspace__sidebar-router"
            :active-session-id="sessionStore.sessionId" :profile="sessionStore.profile" @select="onSidebarSessionSelect"
            @new-session="onSidebarNewSession" />
          <!-- 底部渐变遮罩（DSH 同款——列表滚到设置栏上方时淡出——视觉衔接） -->
          <div class="workspace__sidebar-fade" />
        </div>
        <!-- 全局设置（侧边栏底部——点击向上展开手风琴设置项——非浮层） -->
        <div class="workspace__settings-wrap">
          <Transition name="settings-up">
            <div v-if="settingsOpen" class="workspace__settings-panel">
              <button v-for="item in settingsItems" :key="item.key" class="workspace__settings-item"
                @click="selectSetting(item)">
                <span class="workspace__settings-item-icon" v-html="item.icon" />
                <span class="workspace__settings-item-text">
                  <span class="workspace__settings-item-label">{{ item.label }}</span>
                  <span class="workspace__settings-item-desc">{{ item.desc }}</span>
                </span>
                <svg class="workspace__settings-item-chev" width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 6 15 12 9 18" />
                </svg>
              </button>
            </div>
          </Transition>
          <button class="workspace__sidebar-settings" @click="toggleSettings">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path
                d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            系统设置
            <svg class="workspace__sidebar-settings-chev" :class="{ open: settingsOpen }" width="10" height="10"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
              stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- ── 三级操作区 ── -->
    <div v-if="hasLevel3" class="workspace__area">
      <!-- 工坊页不渲染全局 toolbar（工坊 UI 自带导航，避免双头部） -->
      <WorkspaceToolbar v-if="activeTab !== 'workshop'" class="workspace__area-bar" variant="l3" :title="l3ToolbarTitle"
        :show-back="true" @back="goBack">
        <template #actions>
          <div id="l3-toolbar-actions" />
        </template>
      </WorkspaceToolbar>
      <!-- L3 页面：key=fullPath——切换 agent（profile 参数变）强制重建，避免组件复用不刷新 -->
      <router-view :key="$route.fullPath" name="workspace" class="workspace__area-col" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WorkspaceToolbar from '@/renderer/components/workspace/WorkspaceToolbar.vue'
import { useSessionStore } from '@/renderer/stores/session-store'
import { useChatStore } from '@/renderer/stores/chat-store'
import { useAgentStore } from '@/renderer/stores/agent-store'
import { useSetupThinking, useThinkingState } from '@/renderer/composables/use-agent-thinking'
import AgentCard from '@/renderer/components/chat/AgentCard.vue'
import SessionList from '@/renderer/components/chat/SessionList.vue'
import AgentListView from '@/renderer/views/agents/AgentListView.vue'

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
    if (comps && typeof comps === 'object' && 'workspace' in comps) {
      // 手机上占位 L3 不算，避免列表页被隐藏
      const isMobile = window.innerWidth < 768
      if (isMobile && record.meta?.workspacePlaceholder) return false
      return true
    }
  }
  return false
})

/* ── 状态 ── */
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
    if (route.path.includes('/settings/plugins/install')) return '安装插件'
    if (route.path.includes('/settings/plugins-market/')) return '插件详情'
    if (route.path.includes('/settings/plugins-market')) return '插件市场'
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
/** 侧边栏功能注册表（功能 → 列表组件——与工作区解耦） */
const sidebarRegistry = {
  session: SessionList,
  agent: AgentListView,
}
/** 当前侧边栏功能（默认对话——session list） */
const currentSidebar = ref<keyof typeof sidebarRegistry>('session')
const sidebarComponent = computed(() => sidebarRegistry[currentSidebar.value])

/** 切换侧边栏功能（AgentCard 按钮——只换侧边栏列表——工作区不变） */
function switchSidebar(feature: keyof typeof sidebarRegistry): void {
  currentSidebar.value = feature
}

/** 侧边栏会话选择：点具体 session → 工作区切 chat 页面 */
function onSidebarSessionSelect(sessionId: string): void {
  router.push(`/workspace/chat/${sessionId}`)
}

/** 侧边栏新建会话 */
async function onSidebarNewSession(): Promise<void> {
  const s = await sessionStore.create({ profile: sessionStore.profile })
  if (s) router.push(`/workspace/chat/${s.id}`)
}

/** 系统设置：底部按钮点击向上展开手风琴（设置项——参考 SettingsListView） */
const settingsOpen = ref(false)

interface SettingsItem {
  key: string
  label: string
  desc: string
  icon: string
}

const settingsItems: SettingsItem[] = [
  {
    key: 'model',
    label: '模型设置',
    desc: '管理 AI 模型提供商和默认模型',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>',
  },
  {
    key: 'mcp',
    label: 'MCP 工具',
    desc: '管理 MCP 服务器和外部工具',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>',
  },
  {
    key: 'plugins',
    label: '插件设置',
    desc: '管理客户端插件和扩展能力',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
  },
  {
    key: 'general',
    label: '通用设置',
    desc: '快捷键等全局偏好配置',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="7" y1="9" x2="7" y2="9"/><line x1="12" y1="9" x2="12" y2="9"/><line x1="17" y1="9" x2="17" y2="9"/><line x1="7" y1="15" x2="17" y2="15"/></svg>',
  },
]

function toggleSettings(): void {
  settingsOpen.value = !settingsOpen.value
}

function selectSetting(item: SettingsItem): void {
  settingsOpen.value = false
  router.push(`/workspace/settings/${item.key}`)
}

/** 路由变化时收起设置面板 */
watch(
  () => route.fullPath,
  () => { settingsOpen.value = false }
)

/** 切换 Agent（切侧边栏为 Agent 列表——工作区不变） */
function goAgentList(): void {
  switchSidebar('agent')
}

/** 全局 AgentCard（当前 agent——agentStore） */
const agentStore = useAgentStore()
const agent = computed(() => agentStore.currentAgent)
const profile = computed(() => route.params.profile as string | undefined)
watch(
  () => profile.value ?? 'default',
  (p: string) => { agentStore.loadCurrentAgent(p, true) },
  { immediate: true },
)
/** 全局 thinking 状态（AgentCard 呼吸指示） */
const globalThinking = computed(() => false)

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
  display: grid;
  /* 结构焊死：左列 280 固定 + 右列 minmax(0,1fr)（下限 0——内容永不撑破骨架）
     --sidebar-w 随折叠类变 0（折叠=左列收起） */
  grid-template-columns: var(--sidebar-w, 280px) minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  width: 0;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
    position: relative;
    transition: grid-template-columns 200ms cubic-bezier(0.23, 1, 0.32, 1);
  }

  .workspace__main--col-collapsed {
    --sidebar-w: 0px;
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

.workspace__area-bar {
  display: none;
  /* Liquid Glass（功能层——l3 工具条：玻璃 + 顶部高光边缘 + hairline） */
  background: var(--tk-bg-glass);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  box-shadow:
    0 0.5px 0 var(--tk-glass-edge);
}

/* ── Lv2 列 ── */

.workspace__sidebar-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  position: relative;
  /* 折叠动画统一在外层容器实现（子组件不再自实现） */
  transition: width 0.2s ease;
}

/* 全局 AgentCard（L2 顶部固定——覆盖 l2-inner 子元素 280px min-width——自适应列宽） */
.workspace__sidebar-agent {
  min-width: 0 !important;
  width: auto !important;
  margin: 8px 12px 0;
}

/* 全局设置栏位（L2 底部——无边框按钮——hover 显示背景 + 圆角） */
.workspace__sidebar-settings {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 8px 12px;
  margin: 8px 8px 8px;
  width: calc(100% - 16px);
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--tk-text-secondary);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 160ms cubic-bezier(0.23, 1, 0.32, 1), color 160ms ease;
}

/* Emil：按下反馈 */
.workspace__sidebar-settings:active {
  transform: scale(0.98);
}

@media (hover: hover) and (pointer: fine) {
  .workspace__sidebar-settings:hover {
    color: var(--tk-text-primary);
    background: var(--tk-bg-secondary);
  }
}

.workspace__sidebar-col--collapsed .workspace__sidebar-settings {
  display: none;
}

/* ── 系统设置手风琴（向上展开——非浮层——面板在按钮上方撑开） ── */

.workspace__settings-wrap {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.workspace__sidebar-settings-chev {
  margin-left: auto;
  color: var(--tk-text-tertiary);
  transition: transform 180ms cubic-bezier(0.23, 1, 0.32, 1);
}

.workspace__sidebar-settings-chev.open {
  transform: rotate(180deg);
}

.workspace__settings-panel {
  display: flex;
  flex-direction: column;
  margin: 0 8px;
  background: var(--tk-bg-primary);
  border: 1px solid var(--tk-border);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  overflow: hidden;
}

.workspace__settings-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  font-size: 12px;
  font-family: inherit;
  font-weight: 500;
  color: var(--tk-text-primary);
  text-align: left;
  border: none;
  border-bottom: 1px solid var(--tk-border-light);
  background: transparent;
  cursor: pointer;
  transition: background 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.workspace__settings-item:last-child {
  border-bottom: none;
}

@media (hover: hover) and (pointer: fine) {
  .workspace__settings-item:hover {
    background: var(--tk-bg-secondary);
  }
}

.workspace__settings-item-icon {
  display: inline-flex;
  align-items: center;
  color: var(--tk-text-secondary);
  flex-shrink: 0;
}

.workspace__settings-item-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.workspace__settings-item-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--tk-text-primary);
}

.workspace__settings-item-desc {
  font-size: 10px;
  color: var(--tk-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace__settings-item-chev {
  color: var(--tk-text-tertiary);
  flex-shrink: 0;
}

/* 展开动画：面板从按钮位置向上（translateY 负向——进入时向上展开） */
.settings-up-enter-active,
.settings-up-leave-active {
  transition: opacity 160ms cubic-bezier(0.23, 1, 0.32, 1), transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.settings-up-enter-from,
.settings-up-leave-to {
  opacity: 0;
  transform: translateY(6px);
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
.workspace__sidebar-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  position: relative;
  transition: opacity 0.2s ease;
}

/* 内容保持自然宽度：列折叠收缩时内容宽度不随容器重排（min-width 固定），
   只被 inner 边界裁剪 + 淡出——避免 AgentList/Settings 等列表被挤压 */
.workspace__sidebar-inner>* {
  flex-shrink: 0;
  min-width: 280px;
}

.workspace__sidebar-col--collapsed .workspace__sidebar-inner {
  opacity: 0;
  pointer-events: none;
}

.workspace__sidebar-col--full {
  flex: 1;
  min-width: 0;
  display: flex;
  background: var(--tk-bg-primary);
}

.workspace__sidebar-col--collapsed {
  width: 0 !important;
}

/* ── Lv3 列 ── */

.workspace__area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.workspace__area-col {
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

.workspace__sidebar-router {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 底部渐变遮罩（DSH 同款：transparent → 侧栏填充色——列表滚到设置栏上方淡出——不拦截点击） */
.workspace__sidebar-fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 24px;
  background: linear-gradient(to bottom, transparent, var(--tk-bg-primary));
  pointer-events: none;
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
    display: flex;
    flex-direction: column;
    grid-template-columns: none;
    flex: 1;
    width: auto;
    position: relative;
  }

  .workspace__sidebar-col:not(.workspace__sidebar-col--full) {
    display: flex;
    width: 100%;
    flex: none;
    max-height: 40%;
    border-bottom: 1px solid var(--tk-border);
    background: var(--tk-bg-primary);
  }

  .workspace__sidebar-col--full {
    display: flex;
  }

  .workspace__area-col {
    display: flex;
    flex: 1;
  }

  .workspace__lv2-toolbar {
    display: flex;
  }
}

/* ── 平板 768–1023px ── */
@media (min-width: 768px) and (max-width: 1023px) {
  .workspace__sidebar-col {
    width: 280px;
    flex-shrink: 0;
    border-right: 1px solid var(--tk-border);
    background: var(--tk-bg-primary);
  }

  .workspace__area-col {
    display: flex;
  }

  .workspace__area-bar {
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

  .workspace__sidebar-col {
    width: 280px;
    flex-shrink: 0;
    border-right: 1px solid var(--tk-border);
    background: var(--tk-bg-primary);
  }

  .workspace__area-col {
    display: flex;
  }

  .workspace__area-bar {
    display: flex;
  }

  .workspace__lv2-toolbar {
    display: none;
  }
}
</style>
