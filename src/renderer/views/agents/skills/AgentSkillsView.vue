<template>
  <L3PageLayout class="skill-manage">
    <div class="skill-manage__toolbar">
      <n-select
        v-model:value="skillsCategory"
        :options="categoryOptions"
        placeholder="全部分类"
        size="small"
        style="width: 140px"
        @update:value="onSearchChange"
      />
      <div class="skill-manage__search-wrap">
        <svg class="skill-manage__search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          v-model="skillsName"
          class="skill-manage__search"
          placeholder="搜索"
          enterkeyhint="search"
          @input="onSearchChange"
        />
      </div>
      <span class="skill-manage__count">共 {{ skillsTotal }} 个技能</span>
    </div>

    <div v-if="skillsLoading" class="skill-manage__loading">加载中…</div>
    <div v-else-if="skillsList.length === 0" class="skill-manage__empty">
      <p>暂无技能</p>
      <p class="skill-manage__empty-hint">点击右上角安装新技能</p>
    </div>
    <div v-else class="skill-manage__grid">
      <div
        v-for="skill in skillsList"
        :key="skill.id"
        class="skill-card"
        @click="openSkillDetail(skill)"
      >
        <div class="skill-card__body">
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
              <span class="skill-card__version">v{{ skill.version }}</span>
            </div>
            <div class="skill-card__desc">{{ skill.description }}</div>
            <div class="skill-card__meta">
              <span class="skill-card__tag">{{ skill.category }}</span>
            </div>
          </div>
        </div>
        <div class="skill-card__actions" @click.stop>
          <n-switch
            :value="skill.isEnabled"
            :loading="togglingIds.has(skill.id)"
            @update:value="(val: boolean) => toggleSkill(skill, val)"
          />
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="skillsTotal > skillsPageSize" class="skill-manage__pagination">
      <button class="pagination-btn" :disabled="skillsPage <= 0" @click="loadSkills(skillsPage - 1)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span class="pagination-info">{{ skillsPage + 1 }} / {{ Math.max(1, Math.ceil(skillsTotal / skillsPageSize)) }}</span>
      <button class="pagination-btn" :disabled="(skillsPage + 1) * skillsPageSize >= skillsTotal" @click="loadSkills(skillsPage + 1)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>

    <!-- L3 工具栏动作 -->
    <ToolbarActions>
      <button
        class="toolbar-btn"
        @click="router.push(`/workspace/agents/${detailProfile}/market`)"
        title="安装技能"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
    </ToolbarActions>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { HistoryState } from 'vue-router'
import { NSelect, NSwitch } from 'naive-ui'
import { useAgentStore } from '@/renderer/stores/agent-store'
import type { SkillInfo, SkillCategory } from '@/renderer/api/types'
import ToolbarActions from '@/renderer/components/workspace/ToolbarActions.vue'
import { L3PageLayout } from '@/renderer/components'
import { skillsApi } from '@/renderer/api/skills-api'

const route = useRoute()
const router = useRouter()
const agentStore = useAgentStore()

const detailProfile = computed(() => route.params.profile as string)

/* ── Skills state ── */
const skillsList = ref<SkillInfo[]>([])
const skillsTotal = ref(0)
const skillsPage = ref(0)
const skillsPageSize = ref(20)
const skillsCategory = ref('')
const skillsName = ref('')
const skillsLoading = ref(false)
const skillCategories = ref<SkillCategory[]>([])

const categoryOptions = computed(() => {
  const opts: Array<{ label: string; value: string }> = [{ label: '全部分类', value: '' }]
  for (const cat of skillCategories.value) {
    if (cat.name) opts.push({ label: cat.displayName || cat.name, value: cat.name })
  }
  return opts
})

const togglingIds = ref(new Set<string>())

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchChange() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    skillsPage.value = 0
    loadSkills(0)
  }, 300)
}

async function loadSkills(page: number) {
  const profile = detailProfile.value
  if (!profile) return
  skillsLoading.value = true
  skillsPage.value = page
  try {
    const res = await skillsApi.installed({
      profile,
      offset: page * skillsPageSize.value,
      limit: skillsPageSize.value,
      category: skillsCategory.value || undefined,
      name: skillsName.value || undefined
    })
    skillsList.value = res.items ?? []
    skillsTotal.value = res.total ?? 0
  } catch {
    skillsList.value = []
    skillsTotal.value = 0
  } finally {
    skillsLoading.value = false
  }
}

function openSkillDetail(skill: SkillInfo) {
  router.push({ path: `/workspace/agents/${detailProfile.value}/skill/${skill.id}`, state: { skill } as unknown as HistoryState })
}

async function toggleSkill(skill: SkillInfo, enabled: boolean) {
  if (!detailProfile.value || togglingIds.value.has(skill.id)) return
  togglingIds.value = new Set(togglingIds.value).add(skill.id)
  try {
    if (enabled) {
      await skillsApi.activate(skill.id, detailProfile.value)
    } else {
      await skillsApi.deactivate(skill.id, detailProfile.value)
    }
    skill.isEnabled = enabled
  } catch (e) {
    console.error('Failed to toggle skill', e)
  } finally {
    const next = new Set(togglingIds.value)
    next.delete(skill.id)
    togglingIds.value = next
  }
}

/* ── 初始化 ── */
watch(() => route.params.profile, () => {
  skillsCategory.value = ''
  skillsName.value = ''
  if (skillCategories.value.length === 0) {
    skillsApi.categories().then(res => {
      skillCategories.value = res ?? []
    }).catch(() => { skillCategories.value = [] })
  }
  loadSkills(0)
})

onMounted(() => {
  skillsApi.categories().then(res => {
    skillCategories.value = res ?? []
  }).catch(() => { skillCategories.value = [] })
  loadSkills(0)
})
</script>

<style scoped>
.skill-manage__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.skill-manage__search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}
.skill-manage__search-icon {
  position: absolute;
  left: 8px;
  color: var(--sa-text-tertiary, #aeaeb2);
  pointer-events: none;
}
.skill-manage__search {
  height: 30px;
  padding: 0 10px 0 26px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-text-primary, #1d1d1f);
  font-size: 12px;
  outline: none;
  width: 100%;
  min-width: 0;
  transition: all 0.2s;
}
.skill-manage__search:focus {
  border-color: var(--sa-accent, #007aff);
  background: var(--sa-bg-primary, #fff);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}
.skill-manage__search::placeholder {
  color: var(--sa-text-tertiary, #aeaeb2);
  font-weight: 400;
}
.skill-manage__count {
  font-size: 12px;
  color: var(--sa-text-tertiary, #aeaeb2);
  width: 100%;
  text-align: right;
}
.skill-manage__loading,
.skill-manage__empty {
  text-align: center;
  padding: 40px;
  color: var(--sa-text-tertiary, #aeaeb2);
  font-size: 13px;
}
.skill-manage__empty p {
  margin: 0;
  line-height: 1.6;
}
.skill-manage__empty-hint {
  font-size: 12px;
  opacity: 0.7;
}
.skill-manage__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

@media (max-width: 900px) {
  .skill-manage__grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .skill-manage__grid {
    grid-template-columns: 1fr;
  }
}

.skill-card {
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.12s, box-shadow 0.12s;
  gap: 8px;
}
.skill-card:hover {
  border-color: var(--sa-accent, #007aff);
}
.skill-card__body {
  flex: 1;
  display: flex;
  flex-direction: row;
  gap: 10px;
  min-width: 0;
}
.skill-card__icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-accent, #007aff);
}
.skill-card__info {
  min-width: 0;
}
.skill-card__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
  margin-bottom: 2px;
}
.skill-card__version {
  font-size: 11px;
  color: var(--sa-text-tertiary, #aeaeb2);
  font-weight: 400;
  margin-left: 6px;
}
.skill-card__desc {
  font-size: 12px;
  color: var(--sa-text-secondary, #86868b);
  margin-bottom: 4px;
}
.skill-card__meta { display: flex; gap: 6px; }
.skill-card__tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-text-tertiary, #aeaeb2);
}
.skill-card__actions {
  display: flex;
  justify-content: flex-end;
}
.skill-manage__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
}
.pagination-btn {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--sa-text-secondary, #86868b);
  transition: background 0.12s;
}
.pagination-btn:hover:not(:disabled) {
  background: var(--sa-bg-secondary, #f5f5f7);
}
.pagination-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
.pagination-info {
  font-size: 12px;
  color: var(--sa-text-tertiary, #aeaeb2);
  min-width: 48px;
  text-align: center;
}

/* ── 工具栏按钮 ── */
.toolbar-btn {
  all: unset;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--sa-accent, #007aff);
  padding: 4px 12px;
  border-radius: 6px;
  transition: background 0.12s;
}
.toolbar-btn:hover {
  background: rgba(0, 122, 255, 0.08);
}
</style>
