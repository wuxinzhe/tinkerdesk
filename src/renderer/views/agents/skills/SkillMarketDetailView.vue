<template>
  <L3PageLayout class="skill-market-detail" wide>
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><path d=&quot;M4 19.5A2.5 2.5 0 0 1 6.5 17H20&quot;/><path d=&quot;M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z&quot;/></svg>"
      gradient="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
      :title="detail?.name || skillName"
      :desc="detail?.description || '技能包说明'"
    />
    <!-- 操作行：版本 + 安装 -->
    <div class="smd__header">
      <div class="smd__title-row">
        <span v-if="detail?.version" class="smd__version">v{{ detail.version }}</span>
        <button v-if="detail && !installed" class="smd__install" :disabled="installing" @click="install">
          {{ installing ? '安装中…' : '安装' }}
        </button>
        <span v-else-if="installed" class="smd__installed">已安装</span>
      </div>
    </div>

    <!-- README 内容（Markdown 渲染） -->
    <div v-if="loading" class="smd__state">加载中…</div>
    <div v-else-if="detail?.readme" class="smd__readme">
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
  } finally {
    loading.value = false
  }
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
.smd__header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.smd__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.smd__version {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  font-weight: 500;
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
