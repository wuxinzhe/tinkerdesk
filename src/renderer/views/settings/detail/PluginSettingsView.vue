<script setup lang="ts">
/**
 * PluginSettingsView.vue — 插件设置页（系统设置 → 插件设置）
 *
 * 职责：插件列表 + 启用/停用注册。插件自身的一切操作（自检/模型下载/配置表单）
 * 都在独立 Lv3 配置页（/workspace/settings/plugins/:pluginId）完成。
 * 启用前自检失败 → 跳转配置页引导修复。
 */
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { SaPageHero, L3PageLayout } from '@/renderer/components'
import { pluginsApi } from '@/renderer/api/plugins-api'
import { confirm } from '@/renderer/api/confirm'
import type { PluginInfo } from '@/renderer/api/types'

/** system interface 显示名：前缀区分系统/工具——
 *  voice.*（语音输入/朗读）= 系统级 → 「系统：」；tool.* = 工具级 → 「工具：」 */
const INTERFACE_LABELS: Record<string, string> = {
  'voice.stt': '系统：语音输入（STT）',
  'voice.tts': '系统：朗读（TTS）',
  'tool.stt': '工具：语音转写（STT）',
  'tool.tts': '工具：语音合成（TTS）',
  'tool.computer_use': '工具：电脑控制',
}

/** 接口显示名（已知映射优先——未知接口按前缀兜底：voice.→系统： / tool.→工具：） */
function interfaceLabel(id: string): string {
  if (INTERFACE_LABELS[id]) return INTERFACE_LABELS[id]
  if (id.startsWith('voice.')) return `系统：${id.slice('voice.'.length)}`
  if (id.startsWith('tool.')) return `工具：${id.slice('tool.'.length)}`
  return id
}

interface InterfaceGroup {
  id: string
  label: string
  plugins: PluginInfo[]
}

const router = useRouter()
const loading = ref(false)
const plugins = ref<PluginInfo[]>([])
/** 进入动画标记（卡片 stagger 触发） */
const mounted = ref(false)

async function loadPlugins(): Promise<void> {
  loading.value = true
  try {
    plugins.value = await pluginsApi.list()
  } finally {
    loading.value = false
  }
}

/** 按 system interface 分组：声明同一接口的插件归一组；无接口声明的进「其他插件」 */
const groups = computed<InterfaceGroup[]>(() => {
  const byInterface = new Map<string, PluginInfo[]>()
  const others: PluginInfo[] = []
  for (const p of plugins.value) {
    const ifs = p.manifest.systemInterfaces ?? []
    if (ifs.length === 0) {
      others.push(p)
      continue
    }
    for (const iface of ifs) {
      const list = byInterface.get(iface.id) ?? []
      list.push(p)
      byInterface.set(iface.id, list)
    }
  }
  const rank = (id: string): number => (id.startsWith('voice.') ? 0 : id.startsWith('tool.') ? 1 : 2)
  const ordered = [...byInterface.entries()].sort(
    (a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0])
  )
  const result: InterfaceGroup[] = ordered.map(([id, list]) => ({
    id,
    label: interfaceLabel(id),
    plugins: list,
  }))
  if (others.length > 0) {
    result.push({ id: '__other__', label: '其他插件', plugins: others })
  }
  return result
})

/** 折叠状态（localStorage 记忆——默认全折叠；用户手动展开过的组下次保持） */
const EXPANDED_KEY = 'plugin-settings-expanded-groups'
const expandedGroups = ref<Set<string>>(new Set())

/** 点击组头展开/收起（状态持久化） */
function toggleGroup(id: string): void {
  const next = new Set(expandedGroups.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedGroups.value = next
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]))
  } catch { /* ignore */ }
}

/** 恢复折叠状态（无保存记录 → 默认全折叠） */
function restoreExpanded(): void {
  try {
    const saved = localStorage.getItem(EXPANDED_KEY)
    if (saved) {
      expandedGroups.value = new Set(JSON.parse(saved) as string[])
    }
  } catch { /* ignore */ }
}

onMounted(() => {
  restoreExpanded()
  void loadPlugins()
  requestAnimationFrame(() => {
    mounted.value = true
  })
})

/** 启用/停用（注册/注销）：启用前自检由 toggle 拦截，失败跳配置页引导 */
async function togglePlugin(p: PluginInfo): Promise<void> {
  const enabled = !p.status.enabled
  try {
    const result = await pluginsApi.toggle(p.manifest.id, enabled)
    if (result.ok) {
      p.status.enabled = result.enabled
      p.status.started = result.started ?? false
    } else if (result.checks?.length) {
      // 自检未通过：去配置页完成配置（下载模型/填参数）
      void router.push(`/workspace/settings/plugins/${p.manifest.id}`)
    }
  } catch {
    // 错误提示由 inv 拦截统一派发
  }
}

/** 打开插件市场（npm 在线安装入口——主按钮） */
function openMarket(): void {
  router.push('/workspace/market/extension')
}

/** 安装插件（按类型）：主按钮=zip，箭头菜单可选手动 folder——选文件后跳转分步向导 */
async function installPlugin(kind: 'zip' | 'folder' = 'zip'): Promise<void> {
  try {
    const path = await window.api.plugins.pickInstallPackage(kind)
    if (!path) return
    // 跳转分步安装向导（L3 页面——path 参数——向导内含知情确认）
    router.push({ path: '/workspace/settings/plugins/install', query: { path } })
  } catch {
    // 错误提示由 inv 拦截统一派发
  }
}

/** 安装方式下拉菜单开关 */
const installMenuOpen = ref(false)

/** 进入插件配置页（Lv3） */
function openConfig(p: PluginInfo): void {
  void router.push(`/workspace/settings/plugins/${p.manifest.id}`)
}

/** 点「卸载」→ 全局确认弹窗 → 确认后删除插件及模型 */
async function askUninstall(p: PluginInfo): Promise<void> {
  const ok = await confirm({
    title: `卸载「${p.manifest.name}」？`,
    message: '插件目录及已下载的模型将被一并删除，此操作不可撤销。',
    confirmText: '卸载',
    destructive: true,
  })
  if (!ok) return
  try {
    await pluginsApi.uninstall(p.manifest.id)
    plugins.value = plugins.value.filter((x) => x.manifest.id !== p.manifest.id)
  } catch {
    // 错误提示由 inv 拦截统一派发
  }
}
</script>

<template>
  <L3PageLayout class="plugin-settings-page" :data-mounted="mounted">
    <div class="plugin-settings-page__body">
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><path d=&quot;M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z&quot;/></svg>"
      gradient="linear-gradient(135deg, #ffb340 0%, var(--tk-warning) 100%)"
      title="插件设置"
      desc="管理客户端插件和扩展能力"
    />
    <div class="plugin-settings-page__header">
      <div class="plugin-settings-page__install-group">
        <button class="plugin-settings-page__install plugin-settings-page__install--main" @click="openMarket">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          安装插件
        </button>
        <button class="plugin-settings-page__install plugin-settings-page__install--arrow" @click="installMenuOpen = !installMenuOpen">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div v-if="installMenuOpen" class="plugin-settings-page__install-menu" @click.stop>
          <button class="plugin-settings-page__install-menu-item" @click="installPlugin('zip')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            安装 .zip 插件包
          </button>
          <button class="plugin-settings-page__install-menu-item" @click="installPlugin('folder')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
            安装插件文件夹
          </button>
        </div>
      </div>
    </div>

    <!-- 加载态 -->
    <div v-if="loading" class="plugin-settings-page__state">
      加载中…
    </div>

    <!-- 空态 -->
    <div v-else-if="plugins.length === 0" class="plugin-settings-page__empty">
      <div class="plugin-settings-page__empty-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      </div>
      <div class="plugin-settings-page__empty-text">
        尚未安装插件
      </div>
      <div class="plugin-settings-page__empty-hint">
        下载插件 zip 解压到上述目录后重启应用
      </div>
    </div>

    <!-- 插件列表（按 system interface 分组） -->
    <div v-else class="plugin-settings-page__list">
      <section v-for="g in groups" :key="g.id" class="plugin-group">
        <div
          class="plugin-group__head"
          role="button"
          tabindex="0"
          @click="toggleGroup(g.id)"
          @keydown.enter.prevent="toggleGroup(g.id)"
        >
          <svg
            class="plugin-group__arrow"
            :class="{ 'plugin-group__arrow--open': expandedGroups.has(g.id) }"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
          <span class="plugin-group__label">{{ g.label }}</span>
          <span class="plugin-group__count">{{ g.plugins.length }}</span>
        </div>
        <div v-show="expandedGroups.has(g.id)" class="plugin-group__plugins">
          <div v-for="(p, i) in g.plugins" :key="p.manifest.id" class="plugin-card" :style="{ transitionDelay: `${i * 40}ms` }">
        <div class="plugin-card__header">
          <div class="plugin-card__info">
            <div class="plugin-card__name">
              {{ p.manifest.name }}
              <span v-if="p.manifest.builtin" class="plugin-card__builtin">内置</span>
              <span class="plugin-card__version">v{{ p.manifest.version }}</span>
            </div>
            <div class="plugin-card__desc">
              {{ p.manifest.description || '—' }}
            </div>
            <div class="plugin-card__meta">
              <span v-if="p.manifest.author" class="plugin-card__meta-item">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                {{ p.manifest.author }}
              </span>
              <span v-if="p.manifest.publisher" class="plugin-card__meta-item">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 00-3-3.87" />
                  <path d="M16 3.13a4 4 0 010 7.75" />
                </svg>
                {{ p.manifest.publisher }}
              </span>
              <a
                v-if="p.manifest.homepage"
                :href="p.manifest.homepage"
                target="_blank"
                rel="noopener noreferrer"
                class="plugin-card__meta-item plugin-card__meta-link"
                @click.stop
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                主页
              </a>
            </div>
            <div class="plugin-card__caps">
              <span v-for="cap in p.manifest.capabilities ?? []" :key="cap" class="plugin-card__cap">
                {{ cap }}
              </span>
              <span v-if="!p.manifest.capabilities?.length" class="plugin-card__cap">无能力声明</span>
            </div>
          </div>
          <div class="plugin-card__status">
            <span :class="['plugin-card__dot', `is-${p.status.status}`]"></span>
            {{ { unloaded: '未加载', disabled: '已停用', unready: '未就绪', registered: '已注册' }[p.status.status] ?? '未加载' }}
          </div>
        </div>

        <div v-if="p.status.detail" class="plugin-card__error">
          {{ p.status.detail }}
        </div>

        <div class="plugin-card__actions">
          <button class="plugin-card__btn" :disabled="!p.status.loaded" @click="togglePlugin(p)">
            {{ p.status.enabled ? '停用' : '启用' }}
          </button>
          <button class="plugin-card__btn plugin-card__btn--config" @click="openConfig(p)">
            配置
          </button>
          <button
            v-if="!p.manifest.builtin"
            class="plugin-card__btn plugin-card__btn--danger"
            @click="askUninstall(p)"
          >
            卸载
          </button>
        </div>
        </div>
        </div>
      </section>
    </div>
    </div>
  </L3PageLayout>
</template>

<style scoped>
.plugin-settings-page {
  display: flex;
  flex-direction: column;
  gap: var(--tk-space-5, 20px);
  
  width: 100%;
  height: 100%;
  overflow-y: auto;
}

.plugin-settings-page__body {
  max-width: 680px;
  width: 100%;
}

/* 头部：右侧安装按钮（header 仅按钮组——靠右；菜单 right:0 对齐右缘不超出） */
.plugin-settings-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 16px;
}

.plugin-settings-page__header-text {
  flex: 1;
  min-width: 0;
}

.plugin-settings-page__title {
  font-size: var(--tk-fs-title);
  font-weight: 600;
  color: var(--tk-text-primary);
}

/* 头部右侧安装按钮（组合按钮） */
.plugin-settings-page__install-group {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
}

.plugin-settings-page__install {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--tk-accent);
  background: rgba(0, 122, 255, 0.06);
  border: 1px solid var(--tk-accent);
  cursor: pointer;
  /* emil：指定属性 + 强 ease-out（禁 ease-in-out——迟缓感） */
  transition: background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    border-color 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.plugin-settings-page__install--main {
  border-radius: 8px 0 0 8px;
  border-right: none;
}

.plugin-settings-page__install--arrow {
  border-radius: 0 8px 8px 0;
  padding: 7px 8px;
}

@media (hover: hover) and (pointer: fine) {
  .plugin-settings-page__install:hover {
    background: rgba(0, 122, 255, 0.12);
  }
}

/* 安装方式下拉菜单 */
.plugin-settings-page__install-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 168px;
  width: max-content;
  padding: 4px;
  background: var(--tk-bg-elevated);
  border: 1px solid var(--tk-border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  z-index: 30;
}

.plugin-settings-page__install-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--tk-text-primary);
  background: transparent;
  border: none;
  border-radius: 7px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}

.plugin-settings-page__install-menu-item:hover {
  background: var(--tk-bg-hover);
}

.plugin-settings-page__desc {
  margin-top: var(--tk-space-1, 4px);
  font-size: 13px;
  line-height: 1.5;
  color: var(--tk-text-secondary);
}

.plugin-settings-page__path {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  background: var(--tk-bg-secondary);
  border-radius: 4px;
  padding: 1px 5px;
}

.plugin-settings-page__state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--tk-text-tertiary);
}

.plugin-settings-page__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--tk-space-2, 8px);
  text-align: center;
  color: var(--tk-text-tertiary);
}

/* emil：空态图标——52px 柔和圆角容器（SaEmpty 同款） */
.plugin-settings-page__empty-icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: var(--tk-surface-2, rgba(120, 120, 128, 0.1));
  color: var(--tk-text-tertiary);
}

.plugin-settings-page__empty-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--tk-text-primary);
}

.plugin-settings-page__empty-hint {
  font-size: 11px;
}

.plugin-settings-page__list {
  display: flex;
  flex-direction: column;
  gap: var(--tk-space-6, 24px);
}

/* 接口分组：组头 + 组内插件 */
.plugin-group {
  display: flex;
  flex-direction: column;
  gap: var(--tk-space-3, 10px);
}

.plugin-group__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  cursor: pointer;
  user-select: none;
  border-radius: 8px;
  /* emil：可点元素按压反馈（行级——比按钮轻微） */
  transition: background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.plugin-group__head:active {
  transform: scale(0.99);
}

@media (hover: hover) and (pointer: fine) {
  .plugin-group__head:hover {
    background: var(--tk-surface-2, rgba(120, 120, 128, 0.08));
  }
}

.plugin-group__arrow {
  color: var(--tk-text-tertiary, #aeaeb2);
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.plugin-group__arrow--open {
  transform: rotate(90deg);
}

.plugin-group__label {
  /* emil：分组标题 15px/600 深色（现代——非 iOS 大写小标签） */
  font-size: 15px;
  font-weight: 600;
  color: var(--tk-text-primary);
  letter-spacing: 0.1px;
}

.plugin-group__count {
  font-size: 11px;
  color: var(--tk-text-tertiary, #aeaeb2);
  background: var(--tk-surface-2, rgba(120, 120, 128, 0.12));
  border-radius: 999px;
  padding: 1px 8px;
}

.plugin-group__plugins {
  display: flex;
  flex-direction: column;
  gap: var(--tk-space-3, 10px);
}

.plugin-card {
  padding: var(--tk-space-4, 16px);
  background: var(--tk-bg-primary);
  /* emil：大圆角 + 分层阴影——卡片「浮起」而非「框住」 */
  border: 1px solid var(--tk-border-card);
  border-radius: var(--tk-radius-xl);
  box-shadow: var(--tk-shadow-card);
  /* emil：进入 stagger + hover 阴影——一条 transition（指定属性 + 强 ease-out） */
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 240ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 240ms cubic-bezier(0.23, 1, 0.32, 1),
    box-shadow 200ms cubic-bezier(0.23, 1, 0.32, 1);
}
@media (hover: hover) and (pointer: fine) {
  .plugin-card:hover {
    box-shadow: var(--tk-shadow-card-hover);
  }
}
.plugin-settings-page[data-mounted='true'] .plugin-card {
  opacity: 1;
  transform: translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  .plugin-card {
    opacity: 1;
    transform: none;
    transition: none;
  }
}

.plugin-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--tk-space-3, 12px);
}

.plugin-card__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--tk-text-primary);
}

.plugin-card__version {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 400;
  color: var(--tk-text-tertiary);
}

.plugin-card__desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--tk-text-secondary);
  line-height: 1.5;
}

.plugin-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--tk-text-tertiary);
}

.plugin-card__meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-card__meta-link {
  color: var(--tk-accent);
  text-decoration: none;
}

.plugin-card__meta-link:hover {
  text-decoration: underline;
}

.plugin-card__caps {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
.plugin-card__cap {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 999px;
  color: var(--tk-accent);
  background: rgba(0, 122, 255, 0.08);
}

.plugin-card__status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--tk-text-secondary);
  flex-shrink: 0;
}

.plugin-card__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

/* 状态指示灯三态（registered=绿 / unready=橙 / disabled+unloaded=灰） */
.plugin-card__dot.is-registered {
  background: var(--tk-success, #34c759);
}

.plugin-card__dot.is-unready {
  background: var(--tk-warning, #ff9f0a);
}

.plugin-card__dot.is-disabled,
.plugin-card__dot.is-unloaded {
  background: var(--tk-text-tertiary);
}

.plugin-card__error {
  margin-top: var(--tk-space-2, 8px);
  font-size: 12px;
  color: var(--tk-destructive);
}

.plugin-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--tk-space-2, 8px);
  margin-top: var(--tk-space-3, 12px);
}

.plugin-card__btn {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--tk-text-primary);
  background: var(--tk-bg-primary);
  border: 1px solid var(--tk-border);
  border-radius: 8px;
  cursor: pointer;
  /* emil：指定属性过渡 + 强 ease-out + 按压（transform 由全局 button:active 提供） */
  transition: background-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    border-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

@media (hover: hover) and (pointer: fine) {
  .plugin-card__btn:hover:not(:disabled) {
    border-color: var(--tk-accent);
  }
}

.plugin-card__btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.plugin-card__btn--config {
  color: var(--tk-accent);
  border-color: var(--tk-accent);
  background: rgba(0, 122, 255, 0.06);
}

/* 卸载（危险操作） */
.plugin-card__btn--danger {
  color: var(--tk-destructive);
  border-color: var(--tk-destructive);
  background: rgba(255, 59, 48, 0.06);
}

@media (hover: hover) and (pointer: fine) {
  .plugin-card__btn--danger:hover {
    background: rgba(255, 59, 48, 0.12);
  }

  .plugin-card__btn--config:hover:not(:disabled) {
    background: rgba(0, 122, 255, 0.12);
  }
}

/* ── 手机（≤767px）：触屏目标 + 紧凑间距 ── */
@media (max-width: 767px) {
  .plugin-group__head {
    padding: 8px 2px;
  }

  .plugin-group__label {
    font-size: 14px;
  }

  .plugin-card {
    padding: 14px;
  }

  .plugin-card__btn {
    padding: 8px 14px;
  }

  .plugin-settings-page__install {
    padding: 9px 14px;
  }

  .plugin-settings-page__install--arrow {
    padding: 9px 8px;
  }
}
</style>
