<template>
  <L3PageLayout class="plugin-detail-page">
    <div class="plugin-detail-page__body">
      <!-- 页面 hero -->
      <SaPageHero
        icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><rect x=&quot;3&quot; y=&quot;3&quot; width=&quot;7&quot; height=&quot;7&quot; rx=&quot;1.5&quot; /><rect x=&quot;14&quot; y=&quot;3&quot; width=&quot;7&quot; height=&quot;7&quot; rx=&quot;1.5&quot; /><rect x=&quot;3&quot; y=&quot;14&quot; width=&quot;7&quot; height=&quot;7&quot; rx=&quot;1.5&quot; /><rect x=&quot;14&quot; y=&quot;14&quot; width=&quot;7&quot; height=&quot;7&quot; rx=&quot;1.5&quot; /></svg>"
        gradient="linear-gradient(135deg, #5ac8fa 0%, #0a84ff 100%)"
        title="插件详情"
        desc="查看插件说明、环境要求并安装"
      />

      <!-- 头部信息卡 -->
      <div class="pd-hero">
        <div class="pd-hero__icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
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
      </template>
    </div>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { MarketPluginDetail } from '@/renderer/api/types'
import { SaActionBtn, L3PageLayout, SaPageHero } from '@/renderer/components'
import MarkdownRender from '@/renderer/components/MarkdownRender.vue'
import { pluginsApi } from '@/renderer/api/plugins-api'

const route = useRoute()
const router = useRouter()

const detail = ref<MarketPluginDetail | null>(null)
const loading = ref(true)
const error = ref('')

const displayName = computed(() => (detail.value?.name ?? '').replace(/^tinkerdesk-plugin-/, ''))

function formatDate(s?: string): string {
  if (!s) return '-'
  try {
    return new Date(s).toLocaleDateString()
  } catch {
    return s
  }
}

onMounted(async () => {
  const name = (route.params.pkg as string) || ''
  loading.value = true
  try {
    detail.value = await pluginsApi.marketDetail(name)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})

function goInstall() {
  if (!detail.value || detail.value.installed) return
  router.push({ path: '/workspace/settings/plugins/install', query: { pkg: detail.value.name } })
}
</script>

<style scoped>
.plugin-detail-page {
  width: 100%;
}

.plugin-detail-page__body {
  max-width: 680px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── 头部信息卡 ── */
.pd-hero {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 20px;
  border: 1px solid var(--tk-border);
  border-radius: 12px;
  background: var(--tk-bg-primary);
}

.pd-hero__icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--tk-bg-secondary);
  color: var(--tk-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pd-hero__info {
  flex: 1;
  min-width: 0;
}

.pd-hero__name {
  font-size: 16px;
  font-weight: 600;
  color: var(--tk-text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.pd-hero__official {
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 122, 255, 0.1);
  color: var(--tk-accent);
  font-size: 10px;
  font-weight: 600;
}

.pd-hero__version {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  font-family: 'SF Mono', 'Menlo', monospace;
  font-weight: 400;
}

.pd-hero__desc {
  font-size: 13px;
  color: var(--tk-text-secondary);
  margin-top: 6px;
  line-height: 1.5;
}

.pd-hero__cats {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.pd-hero__cat {
  padding: 2px 8px;
  border-radius: 5px;
  background: var(--tk-bg-secondary);
  font-size: 11px;
  color: var(--tk-text-secondary);
}

.pd-hero__action {
  flex-shrink: 0;
}

/* ── 元信息 ── */
.pd-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 20px;
  border: 1px solid var(--tk-border);
  border-radius: 12px;
  background: var(--tk-bg-primary);
}

.pd-meta__item {
  display: flex;
  gap: 12px;
  font-size: 12px;
}

.pd-meta__label {
  color: var(--tk-text-tertiary);
  width: 60px;
  flex-shrink: 0;
}

.pd-meta__value {
  color: var(--tk-text-secondary);
  word-break: break-all;
}

.pd-meta__link {
  color: var(--tk-accent);
  text-decoration: none;
}

/* ── README ── */
.pd-readme {
  padding: 20px;
  border: 1px solid var(--tk-border);
  border-radius: 12px;
  background: var(--tk-bg-primary);
}

.pd-readme__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tk-text-primary);
  margin-bottom: 12px;
}

.pd-readme__content {
  font-size: 13px;
  line-height: 1.7;
  color: var(--tk-text-secondary);
  overflow-wrap: break-word;
}

.pd-readme :deep(.markdown-render) {
  font-size: 13px;
  line-height: 1.7;
  color: var(--tk-text-secondary);
}

.pd-loading,
.pd-error {
  padding: 32px;
  text-align: center;
  color: var(--tk-text-tertiary);
  font-size: 13px;
}

.pd-error {
  color: #ff3b30;
}
</style>
