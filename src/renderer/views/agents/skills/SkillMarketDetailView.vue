<template>
  <L3PageLayout class="skill-market-detail" wide>
    <!-- 头部：返回 + 技能名/版本 + 安装 -->
    <div class="smd__header">
      <button class="smd__back" @click="goBack">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        返回市场
      </button>
      <div class="smd__title-row">
        <h2 class="smd__name">{{ detail?.name || skillName }}</h2>
        <span v-if="detail?.version" class="smd__version">v{{ detail.version }}</span>
        <button v-if="detail && !installed" class="smd__install" :disabled="installing" @click="install">
          {{ installing ? '安装中…' : '安装' }}
        </button>
        <span v-else-if="installed" class="smd__installed">已安装</span>
      </div>
      <p v-if="detail?.description" class="smd__desc">{{ detail.description }}</p>
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
import { useRoute, useRouter } from 'vue-router'
import MarkdownRender from '@/renderer/components/MarkdownRender.vue'
import { L3PageLayout } from '@/renderer/components'
import { skillsApi } from '@/renderer/api/skills-api'
import type { SkillMarketDetailItem } from '@/renderer/api/types'
import { showErrorToast, showInfoToast } from '@/renderer/utils/notification-utils'

const route = useRoute()
const router = useRouter()

const skillName = computed(() => route.params.skillName as string)
const profile = computed(() => (route.params.profile as string) || 'default')

const detail = ref<SkillMarketDetailItem | null>(null)
const loading = ref(true)
const installing = ref(false)
const installed = ref(false)

function goBack(): void {
  router.push({ path: `/workspace/agents/${profile.value}/market` })
}

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
  margin-bottom: 16px;
}

.smd__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--tk-text-secondary);
  background: transparent;
  border: none;
  padding: 4px 0;
  cursor: pointer;
  transition: color 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
@media (hover: hover) and (pointer: fine) {
  .smd__back:hover { color: var(--tk-text-primary); }
}

.smd__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.smd__name {
  font-size: 20px;
  font-weight: 700;
  color: var(--tk-text-primary);
  margin: 0;
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

.smd__desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--tk-text-secondary);
  line-height: 1.6;
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
