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
 *   二级：列表页（level2 router-view）
 *   三级：详情/操作页（level3 router-view）
 *   桌面端同时显示二+三级，移动端每次只显示一级（default slot）
 *
 * 路由命名规范：
 *   列表路由： default=DetailView, level2=ListView, 无 level3
 *   详情路由： default=DetailView, level2=ListView, level3=DetailView
 *   （default 在移动端全屏渲染，level2 在桌面端中列，level3 在桌面端右列）
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
            level2: () => import('@/renderer/views/chat/ChatListView.vue'),
            level3: () => import('@/renderer/components/workspace/ListPlaceholderView.vue'),
          },
          meta: { level3Placeholder: true },
        },
        {
          path: 'chat/:sessionId',
          components: {
            default: () => import('@/renderer/views/chat/detail/ChatDetailView.vue'),
            level2: () => import('@/renderer/views/chat/ChatListView.vue'),
            level3: () => import('@/renderer/views/chat/detail/ChatDetailView.vue'),
          },
        },
        {
          // 历史预览（入栈新页面，非原位切换）
          path: 'chat/:sessionId/history',
          components: {
            default: () => import('@/renderer/views/chat/detail/HistoryPreviewView.vue'),
            level2: () => import('@/renderer/views/chat/ChatListView.vue'),
            level3: () => import('@/renderer/views/chat/detail/HistoryPreviewView.vue'),
          },
        },
        {
          path: 'chat/:sessionId/conversation/:conversationId',
          components: {
            default: () => import('@/renderer/views/chat/detail/ConversationDetailView.vue'),
            level2: () => import('@/renderer/views/chat/ChatListView.vue'),
            level3: () => import('@/renderer/views/chat/detail/ConversationDetailView.vue'),
          },
        },

        // ── Agents ──
        {
          path: 'agents',
          components: {
            default: () => import('@/renderer/views/agents/AgentListView.vue'),
            level2: () => import('@/renderer/views/agents/AgentListView.vue'),
            level3: () => import('@/renderer/components/workspace/ListPlaceholderView.vue'),
          },
          meta: { level3Placeholder: true },
        },
        {
          path: 'agents/create',
          components: {
            default: () => import('@/renderer/views/agents/edit/AgentEditView.vue'),
            level2: () => import('@/renderer/views/agents/AgentListView.vue'),
            level3: () => import('@/renderer/views/agents/edit/AgentEditView.vue'),
          },
        },
        {
          path: 'agents/:profile/edit',
          components: {
            default: () => import('@/renderer/views/agents/edit/AgentEditView.vue'),
            level2: () => import('@/renderer/views/agents/AgentListView.vue'),
            level3: () => import('@/renderer/views/agents/edit/AgentEditView.vue'),
          },
        },
        {
          path: 'agents/:profile/skills',
          components: {
            default: () => import('@/renderer/views/agents/skills/AgentSkillsView.vue'),
            level2: () => import('@/renderer/views/agents/AgentListView.vue'),
            level3: () => import('@/renderer/views/agents/skills/AgentSkillsView.vue'),
          },
        },
        {
          path: 'agents/:profile/tools',
          components: {
            default: () => import('@/renderer/views/agents/tools/AgentToolsView.vue'),
            level2: () => import('@/renderer/views/agents/AgentListView.vue'),
            level3: () => import('@/renderer/views/agents/tools/AgentToolsView.vue'),
          },
        },
        {
          path: 'agents/:profile/tools/:toolName/provider',
          components: {
            default: () => import('@/renderer/views/agents/tools/ToolProviderSettingsView.vue'),
            level2: () => import('@/renderer/views/agents/AgentListView.vue'),
            level3: () => import('@/renderer/views/agents/tools/ToolProviderSettingsView.vue'),
          },
        },
        {
          path: 'agents/:profile/memory',
          components: {
            default: () => import('@/renderer/views/agents/memory/MemoryManageView.vue'),
            level2: () => import('@/renderer/views/agents/AgentListView.vue'),
            level3: () => import('@/renderer/views/agents/memory/MemoryManageView.vue'),
          },
        },
        {
          path: 'agents/:profile/models',
          components: {
            default: () => import('@/renderer/views/agents/models/ModelSettingsView.vue'),
            level2: () => import('@/renderer/views/agents/AgentListView.vue'),
            level3: () => import('@/renderer/views/agents/models/ModelSettingsView.vue'),
          },
        },
        {
          path: 'agents/:profile/prompt-modules',
          components: {
            default: () => import('@/renderer/views/agents/prompt-modules/PromptModuleListView.vue'),
            level2: () => import('@/renderer/views/agents/AgentListView.vue'),
            level3: () => import('@/renderer/views/agents/prompt-modules/PromptModuleListView.vue'),
          },
        },
        {
          path: 'agents/:profile/prompt-modules/create',
          components: {
            default: () => import('@/renderer/views/agents/prompt-modules/PromptModuleFormView.vue'),
            level2: () => import('@/renderer/views/agents/AgentListView.vue'),
            level3: () => import('@/renderer/views/agents/prompt-modules/PromptModuleFormView.vue'),
          },
        },
        {
          path: 'agents/:profile/prompt-modules/:moduleId/edit',
          components: {
            default: () => import('@/renderer/views/agents/prompt-modules/PromptModuleFormView.vue'),
            level2: () => import('@/renderer/views/agents/AgentListView.vue'),
            level3: () => import('@/renderer/views/agents/prompt-modules/PromptModuleFormView.vue'),
          },
        },
        {
          path: 'agents/:profile/settings',
          components: {
            default: () => import('@/renderer/views/agents/settings/AgentSettingsView.vue'),
            level2: () => import('@/renderer/views/agents/AgentListView.vue'),
            level3: () => import('@/renderer/views/agents/settings/AgentSettingsView.vue'),
          },
        },
        {
          path: 'agents/:profile/market',
          components: {
            default: () => import('@/renderer/views/agents/skills/SkillsMarketView.vue'),
            level2: () => import('@/renderer/views/agents/AgentListView.vue'),
            level3: () => import('@/renderer/views/agents/skills/SkillsMarketView.vue'),
          },
        },
        {
          path: 'agents/:profile/skill/:skillId',
          components: {
            default: () => import('@/renderer/views/agents/skills/SkillDetailView.vue'),
            level2: () => import('@/renderer/views/agents/AgentListView.vue'),
            level3: () => import('@/renderer/views/agents/skills/SkillDetailView.vue'),
          },
        },
        {
          path: 'agents/:profile/skill/:skillId/file/:fileId',
          components: {
            default: () => import('@/renderer/views/agents/skills/SkillFileEditView.vue'),
            level2: () => import('@/renderer/views/agents/AgentListView.vue'),
            level3: () => import('@/renderer/views/agents/skills/SkillFileEditView.vue'),
          },
        },
        {
          path: 'agents/:profile/skill/import',
          components: {
            default: () => import('@/renderer/views/agents/skills/SkillImportView.vue'),
            level2: () => import('@/renderer/views/agents/AgentListView.vue'),
            level3: () => import('@/renderer/views/agents/skills/SkillImportView.vue'),
          },
        },

        // ── Settings ──
        {
          path: 'settings/model/create',
          components: {
            default: () => import('@/renderer/views/settings/detail/AddModelView.vue'),
            level2: () => import('@/renderer/views/settings/SettingsListView.vue'),
            level3: () => import('@/renderer/views/settings/detail/AddModelView.vue'),
          },
        },
        {
          path: 'settings/model/:modelId/edit',
          components: {
            default: () => import('@/renderer/views/settings/detail/EditModelView.vue'),
            level2: () => import('@/renderer/views/settings/SettingsListView.vue'),
            level3: () => import('@/renderer/views/settings/detail/EditModelView.vue'),
          },
        },
        {
          path: 'settings/mcp/create',
          components: {
            default: () => import('@/renderer/views/settings/detail/AddMcpView.vue'),
            level2: () => import('@/renderer/views/settings/SettingsListView.vue'),
            level3: () => import('@/renderer/views/settings/detail/AddMcpView.vue'),
          },
        },
        {
          path: 'settings/mcp/:name/edit',
          components: {
            default: () => import('@/renderer/views/settings/detail/EditMcpView.vue'),
            level2: () => import('@/renderer/views/settings/SettingsListView.vue'),
            level3: () => import('@/renderer/views/settings/detail/EditMcpView.vue'),
          },
        },
        {
          path: 'settings',
          components: {
            default: () => import('@/renderer/views/settings/SettingsListView.vue'),
            level2: () => import('@/renderer/views/settings/SettingsListView.vue'),
            level3: () => import('@/renderer/components/workspace/ListPlaceholderView.vue'),
          },
          meta: { level3Placeholder: true },
        },
        {
          path: 'settings/:section(model|mcp|plugins|voice|general)',
          components: {
            default: () => import('@/renderer/views/settings/detail/SettingsDetailView.vue'),
            level2: () => import('@/renderer/views/settings/SettingsListView.vue'),
            level3: () => import('@/renderer/views/settings/detail/SettingsDetailView.vue'),
          },
          // 真实详情页（非占位）——不加 level3Placeholder：移动端 hasLevel3 才能渲染 L3 详情
        },
        {
          path: 'settings/plugins-market',
          components: {
            default: () => import('@/renderer/views/settings/detail/PluginMarketView.vue'),
            level2: () => import('@/renderer/views/settings/SettingsListView.vue'),
            level3: () => import('@/renderer/views/settings/detail/PluginMarketView.vue'),
          },
          // 插件市场（独立 L3——安装按钮跳转入口）
        },
        {
          path: 'settings/plugins-market/:pkg',
          components: {
            default: () => import('@/renderer/views/settings/detail/PluginMarketDetailView.vue'),
            level2: () => import('@/renderer/views/settings/SettingsListView.vue'),
            level3: () => import('@/renderer/views/settings/detail/PluginMarketDetailView.vue'),
          },
          // 插件市场详情（readme 展示）
        },
        {
          path: 'settings/plugins/install',
          components: {
            default: () => import('@/renderer/views/settings/detail/InstallWizardView.vue'),
            level2: () => import('@/renderer/views/settings/SettingsListView.vue'),
            level3: () => import('@/renderer/views/settings/detail/InstallWizardView.vue'),
          },
          // 安装向导（L3 页面——pkg/path 查询参数）
        },
        {
          path: 'settings/plugins/:pluginId',
          components: {
            default: () => import('@/renderer/views/settings/detail/PluginConfigView.vue'),
            level2: () => import('@/renderer/views/settings/SettingsListView.vue'),
            level3: () => import('@/renderer/views/settings/detail/PluginConfigView.vue'),
          },
          // 真实详情页（非占位）——不加 level3Placeholder
        },

        // ── 工坊 ──
        {
          path: 'workshop',
          components: {
            default: () => import('@/renderer/views/workshop/WorkshopListView.vue'),
            level2: () => import('@/renderer/views/workshop/WorkshopListView.vue'),
            level3: () => import('@/renderer/components/workspace/ListPlaceholderView.vue'),
          },
          meta: { level3Placeholder: true },
        },
        {
          path: 'workshop/:memberId',
          components: {
            default: () => import('@/renderer/views/workshop/detail/WorkshopDetailView.vue'),
            level2: () => import('@/renderer/views/workshop/WorkshopListView.vue'),
            level3: () => import('@/renderer/views/workshop/detail/WorkshopDetailView.vue'),
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
