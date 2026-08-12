<template>
  <L3PageLayout class="skill-manage">
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><polygon points=&quot;12 2 2 7 12 12 22 7 12 2&quot;/><polyline points=&quot;2 17 12 22 22 17&quot;/><polyline points=&quot;2 12 12 17 22 12&quot;/></svg>"
      gradient="linear-gradient(135deg, #2ee6d6 0%, #00c7be 100%)"
      title="技能管理"
      desc="管理该 Agent 可用的技能"
    />
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

    <!-- 安装确认面板已废弃——安装走 SkillImportView（render 解析 + 可修改 + 结构化写入） -->

    <div v-if="skillsLoading" class="skill-manage__loading">
      加载中…
    </div>
    <div v-else-if="skillsList.length === 0" class="skill-manage__empty">
      <p>暂无技能</p>
      <p class="skill-manage__empty-hint">
        点击右上角安装新技能
      </p>
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
            <div class="skill-card__desc">
              {{ skill.description }}
            </div>
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

    <!-- L3 工具栏动作：技能安装（选文件 → 校验 → 安装） -->
    <ToolbarActions>
      <button
        class="toolbar-btn"
        title="安装技能"
        @click="installSkillFromFile"
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
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NSelect, NSwitch } from 'naive-ui'
import type { SkillInfo, SkillCategory } from '@/renderer/api/types'
import ToolbarActions from '@/renderer/components/workspace/ToolbarActions.vue'
import { L3PageLayout, SaPageHero } from '@/renderer/components'
import { skillsApi } from '@/renderer/api/skills-api'

const route = useRoute()
const router = useRouter()

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
  // 不通过 history state 传对象（pushState 无法克隆响应式 Proxy → DataCloneError）；详情页按 skillId 自行加载
  router.push({ path: `/workspace/agents/${detailProfile.value}/skill/${skill.id}` })
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

/** 技能安装：跳转 SkillImportView（render 层解析 + 可手动修改 + 结构化写入） */
async function installSkillFromFile(): Promise<void> {
  const profile = route.params.profile as string
  router.push(`/workspace/agents/${profile}/skill/import`)
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
/* 窄列布局（与系统设置 L3 对齐：680px 宽，靠左） */
.skill-manage {
  width: 100%;
}
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
  color: var(--tk-text-tertiary);
  pointer-events: none;
}
.skill-manage__search {
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
.skill-manage__search:focus {
  border-color: var(--tk-accent);
  background: var(--tk-bg-primary);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}
.skill-manage__search::placeholder {
  color: var(--tk-text-tertiary);
  font-weight: 400;
}
.skill-manage__count {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  width: 100%;
  text-align: right;
}
.skill-manage__loading,
.skill-manage__empty {
  text-align: center;
  padding: 40px;
  color: var(--tk-text-tertiary);
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

/* ── 安装确认面板 ── */

.install-panel {
  margin-bottom: 16px;
  padding: 14px 16px;
  background: var(--tk-bg-elevated);
  border: 1px solid var(--tk-border-light);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.install-panel__heading {
  font-size: 13px;
  font-weight: 600;
  color: var(--tk-text-primary);
}

.install-panel__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--tk-accent);
}

.install-panel__desc {
  font-size: 12px;
  color: var(--tk-text-secondary);
  line-height: 1.5;
  max-height: 48px;
  overflow: hidden;
}

.install-panel__meta {
  font-size: 12px;
  color: var(--tk-text-tertiary);
}

.install-panel__row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.install-panel__label {
  font-size: 12px;
  color: var(--tk-text-secondary);
  flex-shrink: 0;
}

.install-panel__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.action-btn {
  padding: 7px 16px;
  font-size: 13px;
  border-radius: 8px;
  border: 1px solid var(--tk-border);
  background: var(--tk-bg-secondary);
  color: var(--tk-text-primary);
  cursor: pointer;
}

.action-btn:hover {
  border-color: var(--tk-accent);
  color: var(--tk-accent);
}

.action-btn--primary {
  background: var(--tk-accent);
  border-color: var(--tk-accent);
  color: #fff;
}

.action-btn--primary:hover {
  background: var(--tk-accent-hover);
  color: #fff;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: default;
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
  border: 1px solid var(--tk-border);
  border-radius: 10px;
  cursor: pointer;
  /* 卡片辨识度：白底（深色 elevated）+ 轻阴影，与页面背景区分 */
  background: var(--tk-bg-elevated);
  box-shadow: var(--tk-shadow-sm);
  transition: border-color 0.12s, box-shadow 0.12s;
  gap: 8px;
}
.skill-card:hover {
  border-color: var(--tk-accent);
  box-shadow: var(--tk-shadow-md);
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
  background: var(--tk-bg-secondary);
  color: var(--tk-accent);
}
.skill-card__info {
  min-width: 0;
}
.skill-card__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--tk-text-primary);
  margin-bottom: 2px;
}
.skill-card__version {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  font-weight: 400;
  margin-left: 6px;
}
.skill-card__desc {
  font-size: 12px;
  color: var(--tk-text-secondary);
  margin-bottom: 4px;
}
.skill-card__meta { display: flex; gap: 6px; }
.skill-card__tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-tertiary);
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
  color: var(--tk-text-secondary);
  transition: background 0.12s;
}
.pagination-btn:hover:not(:disabled) {
  background: var(--tk-bg-secondary);
}
.pagination-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
.pagination-info {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  min-width: 48px;
  text-align: center;
}

/* ── 工具栏按钮（emil：主入口图标按钮——hairline 边框 + 白底浮起，与导入按钮同款） ── */
.toolbar-btn {
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--tk-bg-primary);
  border: 1px solid var(--tk-border-card);
  box-shadow: var(--tk-shadow-card);
  color: var(--tk-accent);
  transition: background-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1),
    box-shadow 200ms cubic-bezier(0.23, 1, 0.32, 1);
}
.toolbar-btn:active {
  transform: scale(0.97);
}
@media (hover: hover) and (pointer: fine) {
  .toolbar-btn:hover {
    background: var(--tk-bg-secondary);
    box-shadow: var(--tk-shadow-card-hover);
  }
}
</style>
