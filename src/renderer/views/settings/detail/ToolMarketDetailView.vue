<template>
  <L3PageLayout class="tool-detail-page">
    <div class="tool-detail-page__body">
      <!-- 页面 hero -->
      <SaPageHero
        icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><path d=&quot;M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z&quot; /></svg>"
        gradient="linear-gradient(135deg, #34e0a1 0%, #0a84ff 100%)"
        title="工具详情"
        desc="查看工具说明与用途并安装"
      />

      <!-- 头部信息卡 -->
      <div class="pd-hero">
        <div class="pd-hero__icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        </div>
        <div class="pd-hero__info">
          <div class="pd-hero__name">
            {{ displayName }}
            <span v-if="detail?.official" class="pd-hero__official">官方</span>
            <span class="pd-hero__version">v{{ detail?.version }}</span>
          </div>
          <div class="pd-hero__desc">{{ detail?.description || '-' }}</div>
          <div v-if="detail?.categories?.length" class="pd-hero__cats">
            <span v-for="c in detail.categories" :key="c" class="pd-hero__cat">{{ c }}</span>
          </div>
        </div>
        <div class="pd-hero__action">
          <SaActionBtn
            :text="'安装'"
            :done="detail?.installed"
            :done-text="'已装'"
            variant="primary"
            :loading="installing"
            :loading-text="'安装中...'"
            @click="goInstall"
          />
        </div>
      </div>

      <div v-if="loading" class="pd-loading">加载中...</div>
      <div v-else-if="error" class="pd-error">{{ error }}</div>

      <template v-else>
        <!-- 元信息 -->
        <div class="pd-meta">
          <div class="pd-meta__item">
            <span class="pd-meta__label">更新时间</span>
            <span class="pd-meta__value">{{ formatDate(detail?.updated) }}</span>
          </div>
          <div v-if="detail?.dependencies?.length" class="pd-meta__item">
            <span class="pd-meta__label">依赖</span>
            <span class="pd-meta__value">{{ detail.dependencies.join(', ') }}</span>
          </div>
          <div v-if="detail?.homepage" class="pd-meta__item">
            <span class="pd-meta__label">主页</span>
            <a class="pd-meta__value pd-meta__link" :href="detail.homepage" target="_blank" rel="noreferrer">{{ detail.homepage }}</a>
          </div>
        </div>

        <!-- README（markdown 渲染） -->
        <div v-if="detail?.readme" class="pd-readme">
          <div class="pd-readme__title">说明</div>
          <MarkdownRender :content="detail.readme" />
        </div>
        <div v-else class="pd-readme">
          <div class="pd-readme__title">说明</div>
          <div class="pd-readme__empty">该工具暂未提供说明（README）</div>
        </div>
      </template>
    </div>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { MarketToolDetail } from '@/renderer/api/types'
import { SaActionBtn, L3PageLayout, SaPageHero } from '@/renderer/components'
import MarkdownRender from '@/renderer/components/MarkdownRender.vue'
import { toolsApi } from '@/renderer/api/tools-api'

const route = useRoute()
const router = useRouter()

const detail = ref<MarketToolDetail | null>(null)
const loading = ref(true)
const error = ref('')
const installing = ref(false)

const displayName = computed(() => (detail.value?.name ?? '').replace(/^tinkerdesk-tool-/, ''))

function formatDate(s?: string): string {
  if (!s) return '-'
  try {
    return new Date(s).toLocaleDateString()
  } catch {
    return s
  }
}

onMounted(async () => {
  const name = (route.params.name as string) || ''
  loading.value = true
  try {
    detail.value = (await toolsApi.marketDetail(name)) ?? null
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})

async function goInstall() {
  if (!detail.value || detail.value.installed || installing.value) return
  installing.value = true
  try {
    const res = await toolsApi.installTool(detail.value.name)
    if (res.success) {
      detail.value.installed = true
      window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'success', code: 'tool:market:install', message: `工具 ${displayName.value} 安装完成` } }))
    } else {
      window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'tool:market:install', message: res.error ?? '安装失败' } }))
    }
  } finally {
    installing.value = false
  }
}
</script>

<style scoped>
.tool-detail-page { width: 100%; }
.tool-detail-page__body { max-width: 680px; width: 100%; display: flex; flex-direction: column; gap: 16px; }

.pd-hero { display: flex; gap: 14px; align-items: flex-start; padding: 20px; border: 1px solid var(--tk-border); border-radius: 12px; background: var(--tk-bg-primary); }
.pd-hero__icon { width: 44px; height: 44px; border-radius: 10px; background: var(--tk-bg-secondary); color: var(--tk-accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.pd-hero__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.pd-hero__name { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; color: var(--tk-text-primary); }
.pd-hero__official { font-size: 11px; color: var(--tk-accent); border: 1px solid currentColor; border-radius: 4px; padding: 0 5px; }
.pd-hero__version { font-size: 12px; color: var(--tk-text-secondary); font-weight: 400; }
.pd-hero__desc { font-size: 13px; color: var(--tk-text-secondary); }
.pd-hero__cats { display: flex; gap: 6px; flex-wrap: wrap; }
.pd-hero__cat { font-size: 11px; color: var(--tk-text-secondary); background: var(--tk-bg-secondary); border-radius: 4px; padding: 2px 7px; }
.pd-hero__action { flex-shrink: 0; }

.pd-meta { display: flex; flex-wrap: wrap; gap: 8px 28px; padding: 14px 16px; border: 1px solid var(--tk-border); border-radius: 12px; background: var(--tk-bg-primary); }
.pd-meta__item { display: flex; gap: 12px; font-size: 12px; align-items: baseline; }
.pd-meta__label { font-size: 11px; color: var(--tk-text-secondary); white-space: nowrap; }
.pd-meta__value { font-size: 13px; color: var(--tk-text-primary); white-space: nowrap; }
.pd-meta__link { color: var(--tk-accent); text-decoration: none; }
.pd-meta__link:hover { text-decoration: underline; }

.pd-readme { display: flex; flex-direction: column; gap: 10px; padding: 18px; border: 1px solid var(--tk-border); border-radius: 12px; background: var(--tk-bg-primary); }
.pd-readme__title { font-size: 14px; font-weight: 600; color: var(--tk-text-primary); }
.pd-readme__empty { font-size: 13px; color: var(--tk-text-secondary); }

.pd-loading { color: var(--tk-text-secondary); padding: 16px 0; font-size: 13px; }
.pd-error { color: #ff453a; padding: 16px 0; font-size: 13px; }
</style>
