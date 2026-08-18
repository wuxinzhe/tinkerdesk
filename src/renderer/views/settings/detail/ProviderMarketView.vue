<template>
  <L3PageLayout class="provider-market" wide>
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><rect x=&quot;3&quot; y=&quot;3&quot; width=&quot;7&quot; height=&quot;7&quot; rx=&quot;1.5&quot;/><rect x=&quot;14&quot; y=&quot;3&quot; width=&quot;7&quot; height=&quot;7&quot; rx=&quot;1.5&quot;/><rect x=&quot;3&quot; y=&quot;14&quot; width=&quot;7&quot; height=&quot;7&quot; rx=&quot;1.5&quot;/><rect x=&quot;14&quot; y=&quot;14&quot; width=&quot;7&quot; height=&quot;7&quot; rx=&quot;1.5&quot;/></svg>"
      gradient="linear-gradient(135deg, #5ac8fa 0%, var(--tk-accent) 100%)"
      title="扩展市场"
      desc="浏览并安装社区扩展（npm registry）"
    />
    <!-- 筛选栏 -->
    <div class="provider-market__toolbar">
      <n-select
        v-model:value="category"
        :options="categoryOptions"
        placeholder="全部分类"
        size="small"
        style="width: 120px"
        clearable
      />
      <div class="provider-market__search-wrap">
        <svg class="provider-market__search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          v-model="searchName"
          class="provider-market__search"
          placeholder="搜索扩展"
          enterkeyhint="search"
          @input="onSearchChange"
        />
      </div>
      <span class="provider-market__count">共 {{ providers.length }} 个扩展</span>
    </div>

    <div v-if="loading" class="provider-market__skeleton">
      <div v-for="i in 6" :key="i" class="provider-market__skeleton-card">
        <div class="provider-market__skeleton-icon">
          <SaSkeleton variant="rect" width="36px" height="36px" radius="8px" />
        </div>
        <div class="provider-market__skeleton-info">
          <SaSkeleton variant="text" :text-lines="1" height="14px" last-line-width="65%" />
          <SaSkeleton variant="text" :text-lines="2" :last-line-width="'45%'" height="11px" line-height="11px" />
        </div>
      </div>
    </div>

    <SaEmpty v-else-if="providers.length === 0" text="暂未发现扩展" />

    <!-- 扩展列表 -->
    <div v-else class="provider-market__grid">
      <div
        v-for="provider in providers"
        :key="provider.name"
        class="provider-card"
        @click="viewDetail(provider)"
      >
        <div class="provider-card__body">
          <div class="provider-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </div>
          <div class="provider-card__info">
            <div class="provider-card__name">
              {{ displayName(provider.name) }}
              <span v-if="provider.official" class="provider-card__official">官方</span>
              <span class="provider-card__version">v{{ provider.version }}</span>
            </div>
            <div class="provider-card__desc">
              {{ provider.description || '-' }}
            </div>
            <div class="provider-card__meta">
              <!-- keywords（npm 分类词——已过滤生态标记/包全名——包全名不再展示） -->
              <span v-for="kw in providerKeywords(provider)" :key="kw" class="provider-card__tag">{{ kw }}</span>
            </div>
          </div>
        </div>
        <div class="provider-card__actions">
          <!-- 独立安装按钮（对齐技能市场卡片）——详情由点击卡片进入 -->
          <SaActionBtn
            :text="'安装'"
            :done="provider.installed"
            :done-text="'已安装'"
            @click.stop="installProvider(provider)"
          />
        </div>
      </div>
    </div>

  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { MarketProviderItem } from '@/renderer/api/types'
import { NSelect } from 'naive-ui'
import { SaEmpty, SaActionBtn, SaSkeleton, L3PageLayout, SaPageHero } from '@/renderer/components'
import { providersApi } from '@/renderer/api/providers-api'

const router = useRouter()

const providers = ref<MarketProviderItem[]>([])
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

/** 显示名（去掉 tinkerdesk-provider- 前缀——只留能力名） */
function displayName(name: string): string {
  return name.replace(/^tinkerdesk-provider-/, '')
}

/** keywords 展示（过滤生态标记 tinkerdesk-provider 与包全名——只留分类词） */
function providerKeywords(provider: MarketProviderItem): string[] {
  return (provider.keywords ?? []).filter((k) => k.trim() !== '' && !k.startsWith('tinkerdesk-provider'))
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
    const res = await providersApi.marketList({
      category: category.value || undefined,
      search: searchName.value.trim() || undefined,
    })
    providers.value = res.items ?? []
    categories.value = res.categories ?? []
  } catch (e) {
    console.error('Failed to load provider market', e)
    providers.value = []
  } finally {
    loading.value = false
  }
}

async function installProvider(provider: MarketProviderItem) {
  if (provider.installed) return
  // 跳转分步安装向导（L3 页面——pkg 参数）
  router.push({ path: '/workspace/settings/providers/install', query: { pkg: provider.name } })
}

/** 点击卡片 → 详情页（readme） */
function viewDetail(provider: MarketProviderItem) {
  router.push(`/workspace/settings/providers-market/${encodeURIComponent(provider.name)}`)
}
</script>

<style scoped>
.provider-market {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.provider-market__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.provider-market__search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.provider-market__search-icon {
  position: absolute;
  left: 8px;
  color: var(--tk-text-tertiary);
  pointer-events: none;
}

.provider-market__search {
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

.provider-market__search:focus {
  border-color: var(--tk-accent);
  background: var(--tk-bg-primary);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}

.provider-market__search::placeholder {
  color: var(--tk-text-tertiary);
  font-weight: 400;
}

.provider-market__count {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  width: 100%;
  text-align: right;
}

.provider-market__grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
  align-content: start;
}

@media (min-width: 768px) and (max-width: 1023px) {
  .provider-market__grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.provider-card {
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 1px solid var(--tk-border);
  background: var(--tk-bg-primary);
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  /* 整卡可点击进详情（对齐技能市场卡片） */
  cursor: pointer;
}

/* Emil：hover 只在支持 hover 的设备生效（触屏不误触发） */
@media (hover: hover) and (pointer: fine) {
  .provider-card:hover {
    border-color: var(--tk-accent);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  }
}

.provider-card__body {
  display: flex;
  gap: 12px;
  padding: 14px 16px 10px;
  flex: 1;
}

.provider-card__icon {
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

.provider-card__info {
  flex: 1;
  min-width: 0;
}

.provider-card__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--tk-text-primary);
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.provider-card__official {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 122, 255, 0.1);
  color: var(--tk-accent);
  font-size: 10px;
  font-weight: 600;
}

.provider-card__version {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  font-family: 'SF Mono', 'Menlo', monospace;
}

.provider-card__desc {
  font-size: 12px;
  color: var(--tk-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 6px;
}

.provider-card__meta {
  display: flex;
  gap: 6px;
  align-items: center;
}

.provider-card__tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--tk-bg-secondary);
  font-size: 10px;
  color: var(--tk-text-tertiary);
}

.provider-card__actions {
  display: flex;
  justify-content: flex-end;
  padding: 10px 14px;
  border-top: 1px solid var(--tk-border);
}

/* 组合按钮：左=详情 + 右=安装（Emil——按下反馈/精确 transition/hover 门控） */
.provider-card__btn-group {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--tk-accent);
  border-radius: 8px;
  overflow: hidden;
}

.provider-card__btn {
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
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1), background 160ms ease;
}

/* Emil：按下反馈（按钮必须对按压有响应） */
.provider-card__btn:active {
  transform: scale(0.97);
}

@media (hover: hover) and (pointer: fine) {
  .provider-card__btn:hover {
    background: rgba(0, 122, 255, 0.14);
  }
}

.provider-card__btn--install {
  background: var(--tk-accent);
  color: #fff;
  border-left: 1px solid var(--tk-accent);
}

@media (hover: hover) and (pointer: fine) {
  .provider-card__btn--install:hover {
    background: rgba(0, 122, 255, 0.85);
  }
}

.provider-card__btn--install:disabled {
  opacity: 0.55;
  cursor: default;
  transform: none;
}

/* ── 骨架屏 ── */
.provider-market__skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

.provider-market__skeleton-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--tk-border);
  border-radius: 10px;
  background: var(--tk-bg-primary);
}

.provider-market__skeleton-icon {
  flex-shrink: 0;
}

.provider-market__skeleton-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
