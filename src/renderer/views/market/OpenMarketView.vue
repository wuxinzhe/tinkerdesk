<template>
  <L3PageLayout class="open-market" wide>
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><path d=&quot;M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z&quot;/><polyline points=&quot;3.27 6.96 12 12.01 20.73 6.96&quot;/><line x1=&quot;12&quot; y1=&quot;22.08&quot; x2=&quot;12&quot; y2=&quot;12&quot;/></svg>"
      gradient="linear-gradient(135deg, #34c759 0%, var(--tk-accent) 100%)"
      title="开放市场"
      desc="浏览并安装社区开放能力"
    />

    <!-- 品类 Tab（type 路由驱动——打开特定类型直达对应 Tab） -->
    <div class="open-market__tabs" role="tablist">
      <button
        v-for="tab in TABS"
        :key="tab.type"
        class="open-market__tab"
        :class="{ 'open-market__tab--active': activeTab === tab.type }"
        role="tab"
        :aria-selected="activeTab === tab.type"
        @click="switchTab(tab.type)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 技能市场 -->
    <template v-if="activeTab === 'skill'">
      <div class="open-market__toolbar">
        <span class="open-market__count">共 {{ skills.length }} 个技能</span>
      </div>
      <div v-if="loading" class="open-market__grid">
        <div v-for="i in 6" :key="i" class="market-skeleton">
          <SaSkeleton variant="rect" width="36px" height="36px" radius="8px" />
          <SaSkeleton variant="text" :text-lines="1" height="14px" last-line-width="65%" />
          <SaSkeleton variant="text" :text-lines="2" :last-line-width="'45%'" height="11px" line-height="11px" />
        </div>
      </div>
      <SaEmpty v-else-if="skills.length === 0" text="暂未发现技能" />
      <div v-else class="open-market__grid">
        <div v-for="skill in skills" :key="skill.id" class="market-card">
          <div class="market-card__body" @click="viewSkill(skill)">
            <div class="market-card__icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <div class="market-card__info">
              <div class="market-card__name">
                {{ skill.displayName || skill.name }}
                <span v-if="skill.version" class="market-card__version">v{{ skill.version }}</span>
              </div>
              <div class="market-card__desc">{{ skill.description || '-' }}</div>
              <div v-if="skill.category" class="market-card__meta">
                <span class="market-card__tag">{{ skill.category }}</span>
              </div>
            </div>
          </div>
          <div class="market-card__actions">
            <SaActionBtn
              :text="'安装'"
              :done="installedSkillIds.has(skill.id)"
              :loading="installingSkillIds.has(skill.id)"
              :done-text="'已安装'"
              :loading-text="'安装中...'"
              @click="installSkill(skill)"
            />
          </div>
        </div>
      </div>
    </template>

    <!-- 扩展（provider）市场 -->
    <template v-else-if="activeTab === 'extension'">
      <div class="open-market__toolbar">
        <span class="open-market__count">共 {{ providers.length }} 个扩展</span>
      </div>
      <div v-if="loading" class="open-market__grid">
        <div v-for="i in 6" :key="i" class="market-skeleton">
          <SaSkeleton variant="rect" width="36px" height="36px" radius="8px" />
          <SaSkeleton variant="text" :text-lines="1" height="14px" last-line-width="65%" />
          <SaSkeleton variant="text" :text-lines="2" :last-line-width="'45%'" height="11px" line-height="11px" />
        </div>
      </div>
      <SaEmpty v-else-if="providers.length === 0" text="暂未发现扩展" />
      <div v-else class="open-market__grid">
        <div v-for="provider in providers" :key="provider.name" class="market-card" @click="viewProvider(provider)">
          <div class="market-card__body">
            <div class="market-card__icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </div>
            <div class="market-card__info">
              <div class="market-card__name">
                {{ displayProviderName(provider.name) }}
                <span v-if="provider.official" class="market-card__official">官方</span>
                <span class="market-card__version">v{{ provider.version }}</span>
              </div>
              <div class="market-card__desc">{{ provider.description || '-' }}</div>
              <div v-if="providerKeywords(provider).length" class="market-card__meta">
                <span v-for="kw in providerKeywords(provider)" :key="kw" class="market-card__tag">{{ kw }}</span>
              </div>
            </div>
          </div>
          <div class="market-card__actions">
            <SaActionBtn :text="'安装'" :done="!!provider.installed" :done-text="'已安装'" @click.stop="installProvider(provider)" />
          </div>
        </div>
      </div>
    </template>

    <!-- 工具/皮肤/应用市场（规划中） -->
    <template v-else>
      <SaEmpty :text="'「' + activeLabel + '」市场即将上线'" />
    </template>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SaEmpty, SaActionBtn, SaSkeleton, L3PageLayout, SaPageHero } from '@/renderer/components'
import type { SkillInfo, MarketProviderItem } from '@/renderer/api/types'
import { skillsApi } from '@/renderer/api/skills-api'
import { providersApi } from '@/renderer/api/providers-api'
import { useSessionStore } from '@/renderer/stores/session-store'

const route = useRoute()
const router = useRouter()
const sessionStore = useSessionStore()

/** 5 个市场品类——route type 驱动直达对应 Tab */
const TABS = [
  { type: 'extension', label: '扩展' },
  { type: 'tool', label: '工具' },
  { type: 'skin', label: '皮肤' },
  { type: 'app', label: '应用' },
  { type: 'skill', label: '技能' },
] as const

const activeTab = ref<string>((route.params.type as string) || 'extension')
const activeLabel = computed(() => TABS.find((t) => t.type === activeTab.value)?.label ?? activeTab.value)

/** 当前选中的 Agent 身份（全局会话 store） */
const profile = computed(() => sessionStore.profile ?? 'default')

const loading = ref(false)

function switchTab(type: string): void {
  if (activeTab.value === type) return
  // 只改本地状态——不触发路由导航 → 组件不重建，只切换内容区
  activeTab.value = type
}

// ── 技能市场 ──
const skills = ref<SkillInfo[]>([])
const installedSkillIds = ref(new Set<string>())
const installingSkillIds = ref(new Set<string>())

async function loadSkills() {
  loading.value = true
  try {
    // 已装状态来自 listOfficial 返回的 isInstalled（后端已按当前 profile 过滤）——精确反映该 agent 已装
    const list = await skillsApi.listOfficial({ profile: profile.value })
    skills.value = list?.items ?? []
    installedSkillIds.value = new Set((list?.items ?? []).filter((s) => s.isInstalled).map((s) => s.id))
  } catch (e) {
    console.error('load skills market failed', e)
    skills.value = []
  } finally {
    loading.value = false
  }
}

async function installSkill(skill: SkillInfo) {
  if (installedSkillIds.value.has(skill.id) || installingSkillIds.value.has(skill.id)) return
  installingSkillIds.value.add(skill.id)
  try {
    // npm 在线安装——用完整包名 skill.id
    const res = await skillsApi.installFromMarket(skill.id, profile.value)
    if (!res?.ok) {
      window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'skill:market:install', message: res?.error ?? '安装失败' } }))
      return
    }
    installedSkillIds.value = new Set(installedSkillIds.value).add(skill.id)
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'success', code: 'skill:market:install', message: `技能 ${res?.name ?? skill.name} 安装完成` } }))
  } catch (e) {
    console.error('Failed to install skill from market', e)
  } finally {
    const next = new Set(installingSkillIds.value)
    next.delete(skill.id)
    installingSkillIds.value = next
  }
}

function viewSkill(skill: SkillInfo) {
  // 跳现有技能说明页——用完整包名 skill.id + 当前 profile
  router.push({ path: `/workspace/agents/${profile.value}/market/${skill.id}` })
}

// ── 扩展（provider）市场 ──
const providers = ref<MarketProviderItem[]>([])

async function loadProviders() {
  loading.value = true
  try {
    const res = await providersApi.marketList({})
    providers.value = res?.items ?? []
  } catch (e) {
    console.error('load provider market failed', e)
    providers.value = []
  } finally {
    loading.value = false
  }
}

function displayProviderName(name: string): string {
  return name.replace(/^tinkerdesk-provider-/, '')
}

function providerKeywords(provider: MarketProviderItem): string[] {
  return (provider.keywords ?? []).filter((k) => k.trim() !== '' && !k.startsWith('tinkerdesk-provider'))
}

/** 扩展安装：跳转现有分步安装向导 */
function installProvider(provider: MarketProviderItem) {
  if (provider.installed) return
  router.push({ path: '/workspace/settings/providers/install', query: { pkg: provider.name } })
}

function viewProvider(provider: MarketProviderItem) {
  router.push(`/workspace/settings/providers-market/${encodeURIComponent(provider.name)}`)
}

// URL type 变化（外部导航 /market/skill 等）→ 同步本地 Tab
watch(() => route.params.type, (t) => {
  if (typeof t === 'string' && t !== activeTab.value) activeTab.value = t
})

// 切 Tab → 加载对应数据
watch(activeTab, (t) => {
  if (t === 'skill') void loadSkills()
  else if (t === 'extension') void loadProviders()
})

onMounted(() => {
  if (activeTab.value === 'skill') void loadSkills()
  else if (activeTab.value === 'extension') void loadProviders()
})
</script>

<style scoped>
.open-market {
  width: 100%;
  display: flex;
  flex-direction: column;
}

/* ── Tab（品类） ── */
.open-market__tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.open-market__tab {
  padding: 6px 16px;
  border: 1px solid var(--tk-border);
  border-radius: 999px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: transform 160ms ease-out, border-color 150ms, color 150ms, background 150ms;
}
.open-market__tab:active {
  transform: scale(0.96);
}
@media (hover: hover) and (pointer: fine) {
  .open-market__tab:hover {
    border-color: var(--tk-accent);
    color: var(--tk-text-primary);
  }
}
.open-market__tab--active {
  border-color: var(--tk-accent);
  background: rgba(10, 132, 255, 0.1);
  color: var(--tk-accent);
}

/* ── 工具栏 ── */
.open-market__toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
.open-market__count {
  font-size: 12px;
  color: var(--tk-text-tertiary);
}

/* ── 卡片网格（参考技能/扩展市场） ── */
.open-market__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
  align-content: start;
}
@media (min-width: 768px) and (max-width: 1023px) {
  .open-market__grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.market-card {
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 1px solid var(--tk-border);
  background: var(--tk-bg-primary);
  overflow: hidden;
  transition: transform 160ms ease-out, border-color 150ms ease, box-shadow 150ms ease;
}
/* skill 整卡可点进详情（provider 也整卡可点——skill 用 body 内层 click） */
.market-card:active {
  transform: scale(0.99);
}
@media (hover: hover) and (pointer: fine) {
  .market-card:hover {
    border-color: var(--tk-accent);
    box-shadow: var(--tk-shadow-md);
  }
}

.market-card__body {
  display: flex;
  gap: 12px;
  padding: 14px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.market-card__icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(10, 132, 255, 0.08);
  color: var(--tk-accent);
}
.market-card__info {
  flex: 1;
  min-width: 0;
}
.market-card__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--tk-text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}
.market-card__version {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  font-weight: 400;
}
.market-card__official {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(52, 199, 89, 0.12);
  color: #34c759;
}
.market-card__desc {
  font-size: 12px;
  color: var(--tk-text-secondary);
  line-height: 1.5;
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.market-card__meta {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.market-card__tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-tertiary);
}
.market-card__actions {
  display: flex;
  justify-content: flex-end;
  padding: 0 14px 12px;
}

/* ── 骨架 ── */
.market-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: 10px;
  border: 1px solid var(--tk-border);
  background: var(--tk-bg-primary);
}
</style>
