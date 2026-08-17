<template>
  <L3PageLayout class="skill-market-detail" wide>
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><polygon points=&quot;12 2 2 7 12 12 22 7 12 2&quot;/><polyline points=&quot;2 17 12 22 22 17&quot;/><polyline points=&quot;2 12 12 17 22 12&quot;/></svg>"
      gradient="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
      title="技能说明"
      desc="查看技能说明并安装"
    />
    <!-- 信息卡（参照插件详情 pd-hero） -->
    <div class="pd-hero">
      <div class="pd-hero__icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>
      </div>
      <div class="pd-hero__info">
        <div class="pd-hero__name">
          {{ detail?.name || skillName }}
          <span class="pd-hero__version">v{{ detail?.version }}</span>
        </div>
        <div class="pd-hero__desc">{{ detail?.description || '-' }}</div>
      </div>
      <div class="pd-hero__action">
        <button v-if="detail && !installed" class="smd__install" :disabled="installing" @click="install">
          {{ installing ? '安装中…' : '安装' }}
        </button>
        <span v-else-if="installed" class="smd__installed">已安装</span>
      </div>
    </div>

    <!-- README 内容（Markdown 渲染） -->
    <div v-if="loading" class="smd__state">加载中…</div>
    <div v-else-if="detail?.readme" class="smd__readme">
      <div class="smd__readme-title">说明</div>
      <MarkdownRender :content="detail.readme" />
    </div>
    <div v-else class="smd__state">该技能包暂无 README 说明</div>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated, watch } from 'vue'
import { useRoute } from 'vue-router'
import MarkdownRender from '@/renderer/components/MarkdownRender.vue'
import { L3PageLayout, SaPageHero } from '@/renderer/components'
import { skillsApi } from '@/renderer/api/skills-api'
import type { SkillMarketDetailItem } from '@/renderer/api/types'
import { showErrorToast, showInfoToast } from '@/renderer/utils/notification-utils'

const route = useRoute()

const skillName = computed(() => route.params.skillName as string)
const profile = computed(() => (route.params.profile as string) || 'default')

const detail = ref<SkillMarketDetailItem | null>(null)
const loading = ref(true)
const installing = ref(false)
const installed = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    detail.value = await skillsApi.getMarketDetail(skillName.value)
  } catch {
    detail.value = null
  }
  // 判断是否已安装：已装技能 name = 包短名（strip tinkerdesk-skill- 前缀比对）
  installed.value = false
  try {
    const short = skillName.value.replace(/^tinkerdesk-skill-/, '')
    const res = await skillsApi.installed({ profile: profile.value, limit: 500 })
    installed.value = res.items.some((s) => s.name === short)
  } catch {
    /* 忽略——保持未安装态 */
  }
  loading.value = false
}

async function install(): Promise<void> {
  installing.value = true
  try {
    const r = await skillsApi.installFromMarket(skillName.value, profile.value)
    if (r?.ok) {
      installed.value = true
      showInfoToast('技能安装成功')
    } else {
      showErrorToast({ code: 'market:install:error', message: r?.error ?? '安装失败' })
    }
  } catch (e) {
    showErrorToast({ code: 'market:install:error', message: (e as Error).message ?? '安装失败' })
  } finally {
    installing.value = false
  }
}

onMounted(load)

// 路由参数变化（含 keep-alive 复用）时重新加载
watch(() => route.params.skillName, () => {
  load()
})
// keep-alive 复用（从其他页面切回）时重新拉取最新
onActivated(load)
</script>

<style scoped>
/* 信息卡（参照插件详情 pd-hero） */
.pd-hero {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 20px;
  border: 1px solid var(--tk-border);
  border-radius: 12px;
  background: var(--tk-bg-primary);
  margin-bottom: 16px;
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
  gap: 8px;
  flex-wrap: wrap;
}

.pd-hero__version {
  font-size: 12px;
  font-weight: 500;
  color: var(--tk-text-tertiary);
}

.pd-hero__desc {
  margin-top: 6px;
  font-size: 13px;
  color: var(--tk-text-secondary);
  line-height: 1.6;
}

.pd-hero__action {
  flex-shrink: 0;
  align-self: center;
}

.smd__install {
  margin-left: 4px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: #fff;
  background: var(--tk-accent);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 160ms cubic-bezier(0.23, 1, 0.32, 1), transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.smd__install:active { transform: scale(0.97); }
.smd__install:disabled { opacity: 0.6; cursor: default; }
@media (hover: hover) and (pointer: fine) {
  .smd__install:hover { background: rgba(0, 122, 255, 0.88); }
}

.smd__installed {
  font-size: 12px;
  font-weight: 500;
  color: var(--tk-success);
}

.smd__readme {
  background: var(--tk-bg-primary);
  border: 1px solid var(--tk-border);
  border-radius: 12px;
  padding: 24px;
}

.smd__readme-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tk-text-primary);
  margin-bottom: 12px;
}

.smd__state {
  padding: 40px;
  text-align: center;
  color: var(--tk-text-tertiary);
  font-size: 13px;
  background: var(--tk-bg-primary);
  border: 1px solid var(--tk-border);
  border-radius: 12px;
}
</style>
