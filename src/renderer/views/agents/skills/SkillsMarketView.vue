<template>
  <L3PageLayout class="skills-market" wide>
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><circle cx=&quot;11&quot; cy=&quot;11&quot; r=&quot;8&quot;/><line x1=&quot;21&quot; y1=&quot;21&quot; x2=&quot;16.65&quot; y2=&quot;16.65&quot;/></svg>"
      gradient="linear-gradient(135deg, #ffb340 0%, var(--tk-warning) 100%)"
      title="技能市场"
      desc="浏览并安装社区技能"
    />
    <!-- 筛选栏 -->
    <div class="skills-market__toolbar">
      <n-select
        v-model:value="category"
        :options="categoryOptions"
        placeholder="全部分类"
        size="small"
        style="width: 140px"
        @update:value="onFilterChange"
      />
      <div class="skills-market__search-wrap">
        <svg class="skills-market__search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          v-model="searchName"
          class="skills-market__search"
          placeholder="搜索"
          enterkeyhint="search"
          @input="onSearchChange"
        />
      </div>
      <span class="skills-market__count">共 {{ total }} 个技能</span>
    </div>

    <div v-if="loading" class="skills-market__skeleton">
      <div v-for="i in 6" :key="i" class="skills-market__skeleton-card">
        <div class="skills-market__skeleton-icon">
          <SaSkeleton variant="rect" width="36px" height="36px" radius="8px" />
        </div>
        <div class="skills-market__skeleton-info">
          <SaSkeleton variant="text" :text-lines="1" height="14px" last-line-width="65%" />
          <SaSkeleton variant="text" :text-lines="2" :last-line-width="'45%'" height="11px" line-height="11px" />
          <div style="display:flex;gap:4px;margin-top:2px">
            <SaSkeleton variant="rect" width="48px" height="18px" radius="9px" />
            <SaSkeleton variant="rect" width="56px" height="18px" radius="9px" />
          </div>
        </div>
      </div>
    </div>

    <SaEmpty v-else-if="skills.length === 0" text="暂未发现官方技能" />

    <!-- 技能列表 -->
    <div v-else class="skills-market__grid">
      <div
        v-for="skill in skills"
        :key="skill.id"
        class="skill-card"
      >
        <div class="skill-card__body" @click="viewSkill(skill)">
          <div class="skill-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <div class="skill-card__info">
            <div class="skill-card__name">
              {{ skill.displayName || skill.name }}
              <span v-if="skill.version" class="skill-card__version">v{{ skill.version }}</span>
            </div>
            <div class="skill-card__desc">
              {{ skill.description || '-' }}
            </div>
            <div class="skill-card__meta">
              <span v-if="skill.category" class="skill-card__tag">{{ skill.category }}</span>
            </div>
            <div v-if="skill.platforms?.length" class="skill-card__platforms">
              <span v-for="p in skill.platforms" :key="p" class="skill-card__tag">{{ p }}</span>
            </div>
            <div v-if="skill.envs?.length" class="skill-card__envs">
              <span v-for="e in skill.envs" :key="e" class="skill-card__tag">{{ e }}</span>
            </div>
          </div>
        </div>
        <div class="skill-card__actions">
          <SaActionBtn
            :text="'安装'"
            :done="installedIds.has(skill.id)"
            :loading="installingIds.has(skill.id)"
            :done-text="'已安装'"
            :loading-text="'安装中...'"
            @click="installSkill(skill)"
          />
        </div>
      </div>
    </div>

    <!-- 翻页 -->
    <SaPagination v-if="totalPages > 1" v-model="page" :total="total" :page-size="PAGE_SIZE" @update:model-value="goPage" />
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { SkillInfo, SkillCategory } from '@/renderer/api/types'
import { useRouter, useRoute } from 'vue-router'
import type { HistoryState } from 'vue-router'
import { NSelect } from 'naive-ui'
import { SaEmpty, SaPagination, SaActionBtn, SaSkeleton, L3PageLayout, SaPageHero } from '@/renderer/components'
import { skillsApi } from '@/renderer/api/skills-api'

const router = useRouter()
const route = useRoute()

// 从路由参数取当前 Agent profile（路由定义: agents/:profile/market）
const profile = computed(() => (route.params.profile as string) || 'default')

const PAGE_SIZE = 20

const skills = ref<SkillInfo[]>([])
const loading = ref(true)
const page = ref(1)   // 1-based，与 SaPagination 显示语义一致
const total = ref(0)
const category = ref('')
const searchName = ref('')
const categories = ref<SkillCategory[]>([])

// 前端幂等：installingIds 防止重复点击，installedIds 记录已安装
const installingIds = ref(new Set<string>())
const installedIds = ref(new Set<string>())

const totalPages = computed(() => Math.ceil(total.value / PAGE_SIZE))

const categoryOptions = computed(() => {
  const opts: Array<{ label: string; value: string }> = [{ label: '全部分类', value: '' }]
  for (const cat of categories.value) {
    if (cat.name) opts.push({ label: cat.displayName || cat.name, value: cat.name })
  }
  return opts
})

onMounted(() => {
  loadCategories()
  loadSkills()
})

// 切换 agent-item 时重新加载
watch(profile, () => {
  loadCategories()
  loadSkills()
})

async function loadCategories() {
  try {
    categories.value = await skillsApi.categories()
  } catch {
    // 静默
  }
}

function onFilterChange() {
  page.value = 1
  loadSkills()
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchChange() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    loadSkills()
  }, 300)
}

async function loadSkills() {
  loading.value = true
  try {
    const res = await skillsApi.listOfficial({
      offset: (page.value - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
      category: category.value || undefined,
      name: searchName.value || undefined,
      profile: profile.value
    })
    skills.value = res.items ?? []
    total.value = res.total ?? 0
    // 从返回值中提取已安装的 skill ID，初始化/累积 installedIds
    const items = res.items ?? []
    const next = new Set(installedIds.value)
    for (const s of items) {
      if (s.isInstalled) {
        next.add(s.id)
      }
    }
    installedIds.value = next
  } catch (e) {
    console.error('Failed to load skills', e)
    skills.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function goPage(p: number) {
  if (p < 1 || p > totalPages.value) return
  page.value = p
  loadSkills()
}

function viewSkill(skill: SkillInfo) {
  // 市场项 name = npm 包名——跳市场说明页（README）
  router.push({ path: `/workspace/agents/${profile.value}/market/${skill.name}` })
}

async function installSkill(skill: SkillInfo) {
  // 前端幂等：已在安装中或已安装则跳过
  if (installingIds.value.has(skill.id) || installedIds.value.has(skill.id)) return

  installingIds.value = new Set(installingIds.value).add(skill.id)
  try {
    // npm 在线安装（市场包名——skill.id 存的是包名 tinkerdesk-skill-xxx）
    const res = await skillsApi.installFromMarket(skill.id, profile.value)
    if (!res.ok) {
      window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'skill:market:install', message: res.error ?? '安装失败' } }))
      return
    }
    installedIds.value = new Set(installedIds.value).add(skill.id)
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'success', code: 'skill:market:install', message: `技能 ${res.name ?? skill.name} 安装完成` } }))
  } catch (e) {
    console.error('Failed to install skill from market', e)
  } finally {
    const next = new Set(installingIds.value)
    next.delete(skill.id)
    installingIds.value = next
  }
}
</script>

<style scoped>
.skills-market {
  width: 100%;
  display: flex;
  flex-direction: column;
}

@media (max-width: 767px) {
  .skills-market {
    display: flex;
    flex-direction: column;
  }
}

.skills-market__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.skills-market__search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.skills-market__search-icon {
  position: absolute;
  left: 8px;
  color: var(--tk-text-tertiary);
  pointer-events: none;
}

.skills-market__search {
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
  transition: all 0.2s;
}

.skills-market__search:focus {
  border-color: var(--tk-accent);
  background: var(--tk-bg-primary);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}

.skills-market__search::placeholder {
  color: var(--tk-text-tertiary);
  font-weight: 400;
}

.skills-market__count {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  width: 100%;
  text-align: right;
}


.skills-market__grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
  align-content: start;
}

@media (min-width: 768px) and (max-width: 1023px) {
  .skills-market__grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.skill-card {
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 1px solid var(--tk-border);
  background: var(--tk-bg-primary);
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.skill-card:hover {
  border-color: var(--tk-accent);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.skill-card__body {
  display: flex;
  gap: 12px;
  padding: 14px 16px 10px;
  cursor: pointer;
  flex: 1;
}

.skill-card__icon {
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

.skill-card__info {
  flex: 1;
  min-width: 0;
}

.skill-card__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--tk-text-primary);
  margin-bottom: 2px;
}

.skill-card__desc {
  font-size: 12px;
  color: var(--tk-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 6px;
}

.skill-card__meta {
  display: flex;
  gap: 6px;
  align-items: center;
}

.skill-card__tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--tk-bg-secondary);
  font-size: 10px;
  color: var(--tk-text-secondary);
}

.skill-card__version {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  font-family: 'SF Mono', 'Menlo', monospace;
  margin-left: 6px;
  vertical-align: middle;
}

.skill-card__actions {
  display: flex;
  justify-content: flex-end;
  padding: 0 16px 10px;
}

/* ── 骨架屏 ── */
.skills-market__skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 12px;
  padding: 16px;
}

.skills-market__skeleton-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--tk-border);
  border-radius: 10px;
  background: var(--tk-bg-primary);
}

.skills-market__skeleton-icon {
  flex-shrink: 0;
}

.skills-market__skeleton-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

@media (max-width: 768px) {
  .skills-market__skeleton {
    grid-template-columns: 1fr;
    padding: 12px;
  }
}
</style>
