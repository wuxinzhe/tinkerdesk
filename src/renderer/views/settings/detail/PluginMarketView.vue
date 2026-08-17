<template>
  <L3PageLayout class="plugin-market">
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><rect x=&quot;3&quot; y=&quot;3&quot; width=&quot;7&quot; height=&quot;7&quot; rx=&quot;1.5&quot;/><rect x=&quot;14&quot; y=&quot;3&quot; width=&quot;7&quot; height=&quot;7&quot; rx=&quot;1.5&quot;/><rect x=&quot;3&quot; y=&quot;14&quot; width=&quot;7&quot; height=&quot;7&quot; rx=&quot;1.5&quot;/><rect x=&quot;14&quot; y=&quot;14&quot; width=&quot;7&quot; height=&quot;7&quot; rx=&quot;1.5&quot;/></svg>"
      gradient="linear-gradient(135deg, #5ac8fa 0%, var(--tk-accent) 100%)"
      title="插件市场"
      desc="浏览并安装社区插件（npm registry）"
    />
    <!-- 筛选栏 -->
    <div class="plugin-market__toolbar">
      <n-select
        v-model:value="category"
        :options="categoryOptions"
        placeholder="全部分类"
        size="small"
        style="width: 120px"
        clearable
      />
      <div class="plugin-market__search-wrap">
        <svg class="plugin-market__search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          v-model="searchName"
          class="plugin-market__search"
          placeholder="搜索插件"
          enterkeyhint="search"
          @input="onSearchChange"
        />
      </div>
      <span class="plugin-market__count">共 {{ plugins.length }} 个插件</span>
    </div>

    <div v-if="loading" class="plugin-market__skeleton">
      <div v-for="i in 6" :key="i" class="plugin-market__skeleton-card">
        <div class="plugin-market__skeleton-icon">
          <SaSkeleton variant="rect" width="36px" height="36px" radius="8px" />
        </div>
        <div class="plugin-market__skeleton-info">
          <SaSkeleton variant="text" :text-lines="1" height="14px" last-line-width="65%" />
          <SaSkeleton variant="text" :text-lines="2" :last-line-width="'45%'" height="11px" line-height="11px" />
        </div>
      </div>
    </div>

    <SaEmpty v-else-if="plugins.length === 0" text="暂未发现插件" />

    <!-- 插件列表 -->
    <div v-else class="plugin-market__grid">
      <div
        v-for="plugin in plugins"
        :key="plugin.name"
        class="plugin-card"
        @click="viewDetail(plugin)"
      >
        <div class="plugin-card__body">
          <div class="plugin-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </div>
          <div class="plugin-card__info">
            <div class="plugin-card__name">
              {{ displayName(plugin.name) }}
              <span v-if="plugin.official" class="plugin-card__official">官方</span>
              <span class="plugin-card__version">v{{ plugin.version }}</span>
            </div>
            <div class="plugin-card__desc">
              {{ plugin.description || '-' }}
            </div>
            <div class="plugin-card__meta">
              <span class="plugin-card__tag">{{ plugin.name }}</span>
            </div>
          </div>
        </div>
        <div class="plugin-card__actions">
          <!-- 组合按钮：左=详情 + 右=安装（参照插件设置页组合按钮） -->
          <div class="plugin-card__btn-group">
            <button class="plugin-card__btn plugin-card__btn--detail" title="查看详情" @click.stop="viewDetail(plugin)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              详情
            </button>
            <button
              class="plugin-card__btn plugin-card__btn--install"
              :disabled="plugin.installed"
              @click.stop="installPlugin(plugin)"
            >
              <svg v-if="plugin.installed" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              {{ plugin.installed ? '已安装' : '安装' }}
            </button>
          </div>
        </div>
      </div>
    </div>

  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { MarketPluginItem } from '@/renderer/api/types'
import { NSelect } from 'naive-ui'
import { SaEmpty, SaActionBtn, SaSkeleton, L3PageLayout, SaPageHero } from '@/renderer/components'
import { pluginsApi } from '@/renderer/api/plugins-api'

const router = useRouter()

const plugins = ref<MarketPluginItem[]>([])
const loading = ref(true)
const searchName = ref('')
const category = ref('')
const categories = ref<string[]>([])
const categoryOptions = computed(() => {
  const opts: Array<{ label: string; value: string }> = [{ label: '全部分类', value: '' }]
  for (const c of categories.value) {
    opts.push({ label: c, value: c })
  }
  return opts
})

/** 显示名（去掉 tinkerdesk-plugin- 前缀——只留能力名） */
function displayName(name: string): string {
  return name.replace(/^tinkerdesk-plugin-/, '')
}

onMounted(loadMarket)

// 分类/搜索变化 → 真实 npm 查询（不是本地过滤）
watch(category, () => loadMarket())

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchChange() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadMarket(), 300)
}

async function loadMarket() {
  loading.value = true
  try {
    const res = await pluginsApi.marketList({
      category: category.value || undefined,
      search: searchName.value.trim() || undefined,
    })
    plugins.value = res.items ?? []
    categories.value = res.categories ?? []
  } catch (e) {
    console.error('Failed to load plugin market', e)
    plugins.value = []
  } finally {
    loading.value = false
  }
}

async function installPlugin(plugin: MarketPluginItem) {
  if (plugin.installed) return
  // 跳转分步安装向导（L3 页面——pkg 参数）
  router.push({ path: '/workspace/settings/plugins/install', query: { pkg: plugin.name } })
}

/** 点击卡片 → 详情页（readme） */
function viewDetail(plugin: MarketPluginItem) {
  router.push(`/workspace/settings/plugins-market/${encodeURIComponent(plugin.name)}`)
}
</script>

<style scoped>
.plugin-market {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.plugin-market__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.plugin-market__search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.plugin-market__search-icon {
  position: absolute;
  left: 8px;
  color: var(--tk-text-tertiary);
  pointer-events: none;
}

.plugin-market__search {
  height: 30px;
  padding: 0 10px 0 26px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-primary);
  font-size: 12px;
  outline: none;
  width: 100%;
  min-width: 0;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.plugin-market__search:focus {
  border-color: var(--tk-accent);
  background: var(--tk-bg-primary);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}

.plugin-market__search::placeholder {
  color: var(--tk-text-tertiary);
  font-weight: 400;
}

.plugin-market__count {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  width: 100%;
  text-align: right;
}

.plugin-market__grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
  align-content: start;
}

@media (min-width: 768px) and (max-width: 1023px) {
  .plugin-market__grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.plugin-card {
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 1px solid var(--tk-border);
  background: var(--tk-bg-primary);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.plugin-card:hover {
  border-color: var(--tk-accent);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.plugin-card__body {
  display: flex;
  gap: 12px;
  padding: 14px 16px 10px;
  flex: 1;
}

.plugin-card__icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--tk-bg-secondary);
  color: var(--tk-accent);
}

.plugin-card__info {
  flex: 1;
  min-width: 0;
}

.plugin-card__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--tk-text-primary);
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.plugin-card__official {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 122, 255, 0.1);
  color: var(--tk-accent);
  font-size: 10px;
  font-weight: 600;
}

.plugin-card__version {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  font-family: 'SF Mono', 'Menlo', monospace;
}

.plugin-card__desc {
  font-size: 12px;
  color: var(--tk-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 6px;
}

.plugin-card__meta {
  display: flex;
  gap: 6px;
  align-items: center;
}

.plugin-card__tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--tk-bg-secondary);
  font-size: 10px;
  color: var(--tk-text-tertiary);
}

.plugin-card__actions {
  display: flex;
  justify-content: flex-end;
  padding: 10px 14px;
  border-top: 1px solid var(--tk-border);
}

/* 组合按钮：左=详情 + 右=安装 */
.plugin-card__btn-group {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--tk-accent);
  border-radius: 8px;
  overflow: hidden;
}

.plugin-card__btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  background: rgba(0, 122, 255, 0.06);
  color: var(--tk-accent);
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;
}

.plugin-card__btn:hover {
  background: rgba(0, 122, 255, 0.14);
}

.plugin-card__btn--install {
  background: var(--tk-accent);
  color: #fff;
  border-left: 1px solid var(--tk-accent);
}

.plugin-card__btn--install:hover {
  background: rgba(0, 122, 255, 0.85);
}

.plugin-card__btn--install:disabled {
  opacity: 0.55;
  cursor: default;
}
  justify-content: flex-end;
  padding: 0 16px 10px;
}

/* ── 骨架屏 ── */
.plugin-market__skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

.plugin-market__skeleton-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--tk-border);
  border-radius: 10px;
  background: var(--tk-bg-primary);
}

.plugin-market__skeleton-icon {
  flex-shrink: 0;
}

.plugin-market__skeleton-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
