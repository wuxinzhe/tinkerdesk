/**
 * router/index.ts — 路由配置
 *
 * 页面流转规则（详见 docs/technical/client/ui/page-flow.md）：
 *   - Splash（初始化页）→ 认证成功 → Workspace
 *                        → 无 token → Login
 *   - Login → 登录成功 → Workspace
 *            → 需要注册 → Register
 *   - Register → 注册成功 → Login
 *   - LockScreen 不是路由，由 session-store 状态控制 overlay
 *
 * Workspace 路由结构（三级导航）：
 *   一级：NavSidebar（桌面端）/ 抽屉（移动端）
 *   侧边栏：列表页（sidebar router-view）
 *   工作区：详情/操作页（workspace router-view）
 *   桌面端同时显示二+三级，移动端每次只显示一级（default slot）
 *
 * 路由命名规范：
 *   列表路由： default=DetailView, sidebar=ListView, 无 workspace
 *   详情路由： default=DetailView, sidebar=ListView, workspace=DetailView
 *   （default 在移动端全屏渲染，sidebar 在桌面端左列，workspace 在桌面端右列）
 */
import { createRouter, createWebHashHistory } from 'vue-router'

/** 模块级标志：页面刷新后自动重置，确保走完整初始化流程 */
let appInitialized = false

/** 由 LoadingView 在成功完成初始化后调用 */
export function markAppInitialized(): void {
  appInitialized = true
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/splash',
    },
    {
      path: '/splash',
      name: 'splash',
      component: () => import('@/renderer/views/SplashView.vue'),
      meta: { transition: 'fade' },
    },
    {
      // LV1 页面：首次启动初始化向导
      path: '/init-account',
      name: 'init-account',
      component: () => import('@/renderer/views/InitAccountView.vue'),
      meta: { transition: 'fade' },
    },
    {
      path: '/workspace',
      component: () => import('@/renderer/views/WorkspaceView.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: { path: '/workspace/chat' } },

        // ── Chat ──
        {
          path: 'chat',
          components: {
            default: () => import('@/renderer/views/chat/ChatListView.vue'),
            sidebar: () => import('@/renderer/views/chat/ChatListView.vue'),
            workspace: () => import('@/renderer/views/chat/ChatEmptyView.vue'),
          },
          meta: { workspacePlaceholder: true },
        },

        // ── 开放市场（全局——可选 type 直达对应品类 Tab；单 record 保证切换不重建组件） ──
        {
          path: 'market/:type?',
          components: {
            default: () => import('@/renderer/views/market/OpenMarketView.vue'),
            workspace: () => import('@/renderer/views/market/OpenMarketView.vue'),
          },
        },
        {
          path: 'chat/:sessionId',
          components: {
            default: () => import('@/renderer/views/chat/detail/ChatDetailView.vue'),
            sidebar: () => import('@/renderer/views/chat/ChatListView.vue'),
            workspace: () => import('@/renderer/views/chat/detail/ChatDetailView.vue'),
          },
        },
        {
          // 历史预览（入栈新页面，非原位切换）
          path: 'chat/:sessionId/history',
          components: {
            default: () => import('@/renderer/views/chat/detail/HistoryPreviewView.vue'),
            sidebar: () => import('@/renderer/views/chat/ChatListView.vue'),
            workspace: () => import('@/renderer/views/chat/detail/HistoryPreviewView.vue'),
          },
        },
        {
          path: 'chat/:sessionId/conversation/:conversationId',
          components: {
            default: () => import('@/renderer/views/chat/detail/ConversationDetailView.vue'),
            sidebar: () => import('@/renderer/views/chat/ChatListView.vue'),
            workspace: () => import('@/renderer/views/chat/detail/ConversationDetailView.vue'),
          },
        },

        // ── Agents ──
        {
          path: 'agents',
          components: {
            default: () => import('@/renderer/views/agents/AgentListView.vue'),
            sidebar: () => import('@/renderer/views/agents/AgentListView.vue'),
            workspace: () => import('@/renderer/components/workspace/ListPlaceholderView.vue'),
          },
          meta: { workspacePlaceholder: true },
        },
        {
          path: 'agents/create',
          components: {
            default: () => import('@/renderer/views/agents/edit/AgentEditView.vue'),
            sidebar: () => import('@/renderer/views/agents/AgentListView.vue'),
            workspace: () => import('@/renderer/views/agents/edit/AgentEditView.vue'),
          },
        },
        {
          path: 'agents/:profile/edit',
          components: {
            default: () => import('@/renderer/views/agents/edit/AgentEditView.vue'),
            sidebar: () => import('@/renderer/views/agents/AgentListView.vue'),
            workspace: () => import('@/renderer/views/agents/edit/AgentEditView.vue'),
          },
        },
        {
          path: 'agents/:profile/skills',
          components: {
            default: () => import('@/renderer/views/agents/skills/AgentSkillsView.vue'),
            sidebar: () => import('@/renderer/views/agents/AgentListView.vue'),
            workspace: () => import('@/renderer/views/agents/skills/AgentSkillsView.vue'),
          },
        },
        {
          path: 'agents/:profile/tools',
          components: {
            default: () => import('@/renderer/views/agents/tools/AgentToolsView.vue'),
            sidebar: () => import('@/renderer/views/agents/AgentListView.vue'),
            workspace: () => import('@/renderer/views/agents/tools/AgentToolsView.vue'),
          },
        },
        {
          path: 'agents/:profile/tools/:toolName/provider',
          components: {
            default: () => import('@/renderer/views/agents/tools/ToolProviderSettingsView.vue'),
            sidebar: () => import('@/renderer/views/agents/AgentListView.vue'),
            workspace: () => import('@/renderer/views/agents/tools/ToolProviderSettingsView.vue'),
          },
        },
        {
          path: 'agents/:profile/memory',
          components: {
            default: () => import('@/renderer/views/agents/memory/MemoryManageView.vue'),
            sidebar: () => import('@/renderer/views/agents/AgentListView.vue'),
            workspace: () => import('@/renderer/views/agents/memory/MemoryManageView.vue'),
          },
        },
        {
          path: 'agents/:profile/models',
          components: {
            default: () => import('@/renderer/views/agents/models/ModelSettingsView.vue'),
            sidebar: () => import('@/renderer/views/agents/AgentListView.vue'),
            workspace: () => import('@/renderer/views/agents/models/ModelSettingsView.vue'),
          },
        },
        {
          path: 'agents/:profile/prompt-modules',
          components: {
            default: () => import('@/renderer/views/agents/prompt-modules/PromptModuleListView.vue'),
            sidebar: () => import('@/renderer/views/agents/AgentListView.vue'),
            workspace: () => import('@/renderer/views/agents/prompt-modules/PromptModuleListView.vue'),
          },
        },
        {
          path: 'agents/:profile/prompt-modules/create',
          components: {
            default: () => import('@/renderer/views/agents/prompt-modules/PromptModuleFormView.vue'),
            sidebar: () => import('@/renderer/views/agents/AgentListView.vue'),
            workspace: () => import('@/renderer/views/agents/prompt-modules/PromptModuleFormView.vue'),
          },
        },
        {
          path: 'agents/:profile/prompt-modules/:moduleId/edit',
          components: {
            default: () => import('@/renderer/views/agents/prompt-modules/PromptModuleFormView.vue'),
            sidebar: () => import('@/renderer/views/agents/AgentListView.vue'),
            workspace: () => import('@/renderer/views/agents/prompt-modules/PromptModuleFormView.vue'),
          },
        },
        {
          path: 'agents/:profile/settings',
          components: {
            default: () => import('@/renderer/views/agents/settings/AgentSettingsView.vue'),
            sidebar: () => import('@/renderer/views/agents/AgentListView.vue'),
            workspace: () => import('@/renderer/views/agents/settings/AgentSettingsView.vue'),
          },
        },
        {
          path: 'agents/:profile/market',
          components: {
            default: () => import('@/renderer/views/agents/skills/SkillsMarketView.vue'),
            sidebar: () => import('@/renderer/views/agents/AgentListView.vue'),
            workspace: () => import('@/renderer/views/agents/skills/SkillsMarketView.vue'),
          },
        },
        {
          /* 技能市场说明页（README Markdown 渲染） */
          path: 'agents/:profile/market/:skillName',
          components: {
            default: () => import('@/renderer/views/agents/skills/SkillMarketDetailView.vue'),
            sidebar: () => import('@/renderer/views/agents/AgentListView.vue'),
            workspace: () => import('@/renderer/views/agents/skills/SkillMarketDetailView.vue'),
          },
        },
        {
          path: 'agents/:profile/skill/:skillId',
          components: {
            default: () => import('@/renderer/views/agents/skills/SkillDetailView.vue'),
            sidebar: () => import('@/renderer/views/agents/AgentListView.vue'),
            workspace: () => import('@/renderer/views/agents/skills/SkillDetailView.vue'),
          },
        },
        {
          path: 'agents/:profile/skill/:skillId/file/:fileId',
          components: {
            default: () => import('@/renderer/views/agents/skills/SkillFileEditView.vue'),
            sidebar: () => import('@/renderer/views/agents/AgentListView.vue'),
            workspace: () => import('@/renderer/views/agents/skills/SkillFileEditView.vue'),
          },
        },
        {
          path: 'agents/:profile/skill/import',
          components: {
            default: () => import('@/renderer/views/agents/skills/SkillImportView.vue'),
            sidebar: () => import('@/renderer/views/agents/AgentListView.vue'),
            workspace: () => import('@/renderer/views/agents/skills/SkillImportView.vue'),
          },
        },

        // ── Settings ──
        {
          path: 'settings/model/create',
          components: {
            default: () => import('@/renderer/views/settings/detail/AddModelView.vue'),
            sidebar: () => import('@/renderer/views/settings/SettingsListView.vue'),
            workspace: () => import('@/renderer/views/settings/detail/AddModelView.vue'),
          },
        },
        {
          path: 'settings/model/:modelId/edit',
          components: {
            default: () => import('@/renderer/views/settings/detail/EditModelView.vue'),
            sidebar: () => import('@/renderer/views/settings/SettingsListView.vue'),
            workspace: () => import('@/renderer/views/settings/detail/EditModelView.vue'),
          },
        },
        {
          path: 'settings',
          components: {
            default: () => import('@/renderer/views/settings/SettingsListView.vue'),
            sidebar: () => import('@/renderer/views/settings/SettingsListView.vue'),
            workspace: () => import('@/renderer/components/workspace/ListPlaceholderView.vue'),
          },
          meta: { workspacePlaceholder: true },
        },
        {
          path: 'settings/:section(model|providers|voice|general)',
          components: {
            default: () => import('@/renderer/views/settings/detail/SettingsDetailView.vue'),
            sidebar: () => import('@/renderer/views/settings/SettingsListView.vue'),
            workspace: () => import('@/renderer/views/settings/detail/SettingsDetailView.vue'),
          },
          // 真实详情页（非占位）——不加 workspacePlaceholder：移动端 hasLevel3 才能渲染 L3 详情
        },
        {
          path: 'settings/providers-market',
          components: {
            default: () => import('@/renderer/views/settings/detail/ProviderMarketView.vue'),
            sidebar: () => import('@/renderer/views/settings/SettingsListView.vue'),
            workspace: () => import('@/renderer/views/settings/detail/ProviderMarketView.vue'),
          },
          // 扩展市场（独立 L3——安装按钮跳转入口）
        },
        {
          path: 'settings/providers-market/:pkg',
          components: {
            default: () => import('@/renderer/views/settings/detail/ProviderMarketDetailView.vue'),
            sidebar: () => import('@/renderer/views/settings/SettingsListView.vue'),
            workspace: () => import('@/renderer/views/settings/detail/ProviderMarketDetailView.vue'),
          },
          // 扩展市场详情（readme 展示）
        },
        {
          path: 'settings/tools-market/:name',
          components: {
            default: () => import('@/renderer/views/settings/detail/ToolMarketDetailView.vue'),
            sidebar: () => import('@/renderer/views/settings/SettingsListView.vue'),
            workspace: () => import('@/renderer/views/settings/detail/ToolMarketDetailView.vue'),
          },
          // 工具市场详情（readme 展示）
        },
        {
          path: 'settings/providers/install',
          components: {
            default: () => import('@/renderer/views/settings/detail/InstallWizardView.vue'),
            sidebar: () => import('@/renderer/views/settings/SettingsListView.vue'),
            workspace: () => import('@/renderer/views/settings/detail/InstallWizardView.vue'),
          },
          // 安装向导（L3 页面——pkg/path 查询参数）
        },
        {
          path: 'settings/providers/:providerId',
          components: {
            default: () => import('@/renderer/views/settings/detail/ProviderConfigView.vue'),
            sidebar: () => import('@/renderer/views/settings/SettingsListView.vue'),
            workspace: () => import('@/renderer/views/settings/detail/ProviderConfigView.vue'),
          },
          // 真实详情页（非占位）——不加 workspacePlaceholder
        },

        // ── 工坊 ──
        {
          path: 'workshop',
          components: {
            default: () => import('@/renderer/views/workshop/WorkshopListView.vue'),
            sidebar: () => import('@/renderer/views/workshop/WorkshopListView.vue'),
            workspace: () => import('@/renderer/components/workspace/ListPlaceholderView.vue'),
          },
          meta: { workspacePlaceholder: true },
        },
        {
          path: 'workshop/:memberId',
          components: {
            default: () => import('@/renderer/views/workshop/detail/WorkshopDetailView.vue'),
            sidebar: () => import('@/renderer/views/workshop/WorkshopListView.vue'),
            workspace: () => import('@/renderer/views/workshop/detail/WorkshopDetailView.vue'),
          },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

// 路由守卫
router.beforeEach((to, _from) => {
  // 刷新后强制走 splash → workspace 的完整初始化流程
  if (to.meta.requiresAuth && !appInitialized) {
    // 排除 bootstrap 页面自身，防止循环
    if (to.name !== 'splash' && to.name !== 'init-account') {
      sessionStorage.setItem('app_redirect_target', to.fullPath)
    }
    return { name: 'splash' }
  }
})

export default router
