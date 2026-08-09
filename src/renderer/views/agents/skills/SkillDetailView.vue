<template>
  <L3PageLayout class="skill-detail">
    <!-- 页头 -->
    <SaPageHero
      icon='<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>'
      gradient="linear-gradient(135deg, #2ee6d6 0%, #00c7be 100%)"
      title="技能详情"
      desc="查看技能的配置与说明"
    />
    <!-- 编辑/删除 → workspace-toolbar 右侧 actions（Teleport） -->
    <ToolbarActions>
      <button class="icon-btn" :disabled="!skill" title="编辑" @click="startEdit">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
      </button>
      <button class="icon-btn icon-btn--danger" :disabled="!skill" title="删除" @click="handleDelete">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </ToolbarActions>
    <div class="skill-detail__body" v-if="skill">
      <!-- 头部 -->
      <div class="skill-detail__header">
        <div class="skill-detail__icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        </div>
        <div class="skill-detail__heading">
          <h3>{{ skill.displayName || skill.name }}</h3>
          <div class="skill-detail__badges">
            <span class="badge">id: {{ skill.id }}</span>
            <span v-if="skill.author" class="badge">作者: {{ skill.author }}</span>
            <span v-if="skill.category" class="badge">{{ skill.category }}</span>
            <span v-if="skill.version" class="badge">v{{ skill.version }}</span>
            <span v-if="skill.license" class="badge">{{ skill.license }}</span>
          </div>
        </div>
      </div>

      <!-- 编辑模式：公共技能表单面板（基本信息 + 高级折叠 + 正文） -->
      <SkillFormPanel v-if="editing" v-model:model="drafts" :categories="categories" style="margin-bottom: 16px" />

      <!-- 描述（编辑时隐藏——面板已含） -->
      <div v-if="!editing" class="detail-section">
        <div class="detail-section__label">描述</div>
        <div class="detail-section__value">{{ skill.description || '-' }}</div>
      </div>

      <!-- Tags + 平台（编辑时隐藏——面板已含） -->
      <div v-if="!editing && (skill.tags?.length || skill.platforms?.length)" class="detail-section">
        <div v-if="skill.tags?.length" class="detail-section">
          <div class="detail-section__label">标签</div>
          <div class="detail-section__tags">
            <span v-for="tag in skill.tags" :key="tag" class="tag">{{ tag }}</span>
          </div>
        </div>
        <div v-if="skill.platforms?.length" class="detail-section">
          <div class="detail-section__label">支持平台</div>
          <div class="detail-section__tags">
            <span v-for="p in skill.platforms" :key="p" class="tag">{{ p }}</span>
          </div>
        </div>
      </div>


      <div v-if="!editing" class="detail-section">
        <div class="detail-section__header">
          <div class="detail-section__label">正文</div>
          <div class="markdown-toggle">
            <button
              class="markdown-toggle__btn"
              :class="{ active: !showRaw }"
              @click="showRaw = false"
            >渲染</button>
            <button
              class="markdown-toggle__btn"
              :class="{ active: showRaw }"
              @click="showRaw = true"
            >原始</button>
          </div>
        </div>
        <div v-if="!skill.body" class="detail-section__empty">(无正文)</div>
        <div
          v-else-if="!showRaw"
          class="detail-section__rendered"
        >
          <MarkdownRender :content="skill.body" :highlight-code="true" />
        </div>
        <pre v-else class="detail-section__body">{{ skill.body }}</pre>
      </div>

      <!-- 高级属性（标题栏划分，默认折叠） -->
      <div v-if="!editing" class="advanced-section">
        <button class="advanced-toggle" @click="advancedOpen = !advancedOpen">
          <span class="advanced-chevron" :class="{ open: advancedOpen }">▸</span>
          高级属性
        </button>
        <div v-show="advancedOpen" class="advanced-content">
        <div v-if="skill.dependencies?.length" class="detail-section">
          <div class="detail-section__label">依赖</div>
          <div class="detail-section__tags">
            <span v-for="d in skill.dependencies" :key="d" class="tag">{{ d }}</span>
          </div>
        </div>
        <div v-if="skill.requiresToolsets?.length" class="detail-section">
          <div class="detail-section__label">必需工具集</div>
          <div class="detail-section__tags">
            <span v-for="t in skill.requiresToolsets" :key="t" class="tag">{{ t }}</span>
          </div>
        </div>
        <div v-if="skill.requiresTools?.length" class="detail-section">
          <div class="detail-section__label">必需工具</div>
          <div class="detail-section__tags">
            <span v-for="t in skill.requiresTools" :key="t" class="tag">{{ t }}</span>
          </div>
        </div>
        <div v-if="skill.fallbackForToolsets?.length" class="detail-section">
          <div class="detail-section__label">工具集回退</div>
          <div class="detail-section__tags">
            <span v-for="t in skill.fallbackForToolsets" :key="t" class="tag">{{ t }}</span>
          </div>
        </div>
        <div v-if="skill.fallbackForTools?.length" class="detail-section">
          <div class="detail-section__label">工具回退</div>
          <div class="detail-section__tags">
            <span v-for="t in skill.fallbackForTools" :key="t" class="tag">{{ t }}</span>
          </div>
        </div>
        <div v-if="skill.envVars" class="detail-section">
          <div class="detail-section__label">环境变量</div>
          <pre class="detail-section__code">{{ skill.envVars }}</pre>
        </div>
        <div v-if="skill.commands" class="detail-section">
          <div class="detail-section__label">命令</div>
          <pre class="detail-section__code">{{ skill.commands }}</pre>
        </div>
      </div>
      </div>

      <!-- 技能文件（折叠——按 skill_id 加载清单） -->
      <div class="advanced-section">
        <button class="advanced-toggle" @click="fileOpen = !fileOpen">
          <span class="advanced-chevron" :class="{ open: fileOpen }">▸</span>
          技能文件（{{ files.length }}）
          <span class="file-add-btn" @click.stop="goAddFile" title="新增文件">＋</span>
        </button>
        <div v-show="fileOpen" class="file-content">
          <div v-if="files.length" class="file-table">
            <div class="file-table__row file-table__head">
              <span>ID</span><span>文件名</span><span>类型</span><span>语言</span><span>排序</span><span></span>
            </div>
            <div v-for="f in files" :key="f.id" class="file-table__row">
              <span class="file-id">{{ f.id }}</span>
              <span class="file-name" :title="f.name">{{ f.name || f.fileType }}</span>
              <span class="file-type">{{ f.fileType }}</span>
              <span class="file-lang">{{ f.language || '-' }}</span>
              <span class="file-order">{{ f.sortOrder }}</span>
              <span class="file-actions">
                <button class="icon-btn" title="编辑" @click="goEditFile(f)">✎</button>
                <button class="icon-btn icon-btn--danger" title="删除" @click="handleDeleteFile(f)">🗑</button>
              </span>
            </div>
          </div>
          <div v-else class="file-empty">暂无文件——点右上角 ＋ 新增</div>
        </div>
      </div>

      <!-- 更新时间 -->
      <div v-if="skill.updatedAt" class="skill-detail__updated">
        更新于 {{ new Date(skill.updatedAt).toLocaleString('zh-CN') }}
      </div>

      <!-- 底部操作（编辑模式） -->
      <div v-if="editing" class="skill-detail__bottom-actions">
        <button class="action-btn action-btn--primary" @click="saveEdit">保存</button>
        <button class="action-btn" @click="cancelEdit">取消</button>
      </div>
    </div>

    <!-- 骨架屏（数据加载中） -->
    <div v-else class="skill-detail__body skill-detail__skeleton">
      <div class="skeleton-line skeleton-line--title"></div>
      <div class="skeleton-line skeleton-line--sub"></div>
      <div class="skeleton-block skeleton-block--desc"></div>
      <div class="skeleton-block"></div>
      <div class="skeleton-block"></div>
    </div>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import MarkdownRender from '@/renderer/components/MarkdownRender.vue'
import { skillsApi } from '@/renderer/api/skills-api'
import { confirm } from '@/renderer/api/confirm'
import type { SkillInfo, SkillFileInfo } from '@/renderer/api/types'
import { L3PageLayout, SaPageHero } from '@/renderer/components'
import ToolbarActions from '@/renderer/components/workspace/ToolbarActions.vue'
import SkillFormPanel from '@/renderer/views/agents/skills/SkillFormPanel.vue'

const router = useRouter()
const route = useRoute()
const skill = ref<SkillInfo | null>(null)
const showRaw = ref(false)
const editing = ref(false)
const advancedOpen = ref(false)
const fileOpen = ref(false)
const files = ref<SkillFileInfo[]>([])
const categories = ref<Array<{ name: string; displayName?: string }>>([])
const drafts = ref({
  name: '', displayName: '', description: '', category: '', tags: '', platforms: '',
  version: '', author: '', license: '',
  dependencies: '', requiresToolsets: '', requiresTools: '', fallbackForToolsets: '', fallbackForTools: '',
  triggers: '', triggerConditions: '', config: '', envVars: '', commands: '', body: '',
  relatedNames: '',
})

async function loadDetail() {
  const skillId = route.params.skillId as string
  const profile = route.params.profile as string
  const res = await skillsApi.detail(skillId, profile)
  if (res) {
    skill.value = res
    // 技能文件清单（按 skill_id）
    try {
      files.value = await skillsApi.listSkillFiles(skillId)
    } catch {
      files.value = []
    }
    return true
  }
  return false
}

onMounted(async () => {
  // 分类下拉选项（编辑模式用）
  try {
    categories.value = await skillsApi.categories()
  } catch {
    // 分类加载失败不阻塞详情
  }
  try {
    if (await loadDetail()) return
  } catch {
    // 加载失败 → 返回上一页
  }
  goBack()
})

function goBack() {
  router.back()
}

function startEdit() {
  if (!skill.value) return
  // 组件实例复用（无 URL 跳转）——重置折叠状态，避免上次残留
  advancedOpen.value = false
  drafts.value = {
    name: skill.value.name ?? '',
    displayName: skill.value.displayName ?? '',
    description: skill.value.description ?? '',
    category: skill.value.category ?? '',
    version: skill.value.version ?? '',
    author: skill.value.author ?? '',
    license: skill.value.license ?? '',
    tags: (skill.value.tags ?? []).join(','),
    platforms: (skill.value.platforms ?? []).join(','),
    dependencies: (skill.value.dependencies ?? []).join(','),
    requiresToolsets: (skill.value.requiresToolsets ?? []).join(','),
    requiresTools: (skill.value.requiresTools ?? []).join(','),
    fallbackForToolsets: (skill.value.fallbackForToolsets ?? []).join(','),
    fallbackForTools: (skill.value.fallbackForTools ?? []).join(','),
    triggers: (skill.value.triggers ?? []).join(','),
    triggerConditions: skill.value.triggerConditions ?? '',
    config: skill.value.config ?? '[]',
    envVars: skill.value.envVars ?? '',
    commands: skill.value.commands ?? '',
    body: skill.value.body ?? '',
    relatedNames: (skill.value.related ?? []).map((r) => r.name).join(', '),
  }
  editing.value = true
}

async function saveEdit() {
  if (!skill.value) return
  // 长度校验（与后端一致）
  if (drafts.value.body.length > 50 * 1024) {
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'skill:update', message: `正文过长（上限 ${50 * 1024} 字符）——请精简或拆分为附件` } }))
    return
  }
  try {
    const d = drafts.value
    await skillsApi.updateSkill({
      id: skill.value.id,
      profile: route.params.profile as string,
      displayName: d.displayName,
      description: d.description,
      category: d.category,
      version: d.version,
      author: d.author,
      license: d.license,
      tags: d.tags,
      platforms: d.platforms,
      dependencies: d.dependencies,
      requiresToolsets: d.requiresToolsets,
      requiresTools: d.requiresTools,
      fallbackForToolsets: d.fallbackForToolsets,
      fallbackForTools: d.fallbackForTools,
      triggers: d.triggers,
      triggerConditions: d.triggerConditions,
      config: d.config,
      envVars: d.envVars,
      commands: d.commands,
      body: d.body,
      related: d.relatedNames ? d.relatedNames.split(',').map((x: string) => x.trim()).filter(Boolean) : undefined,
    })
    editing.value = false
    advancedOpen.value = false
    // 保存后彻底刷新：重新从后端拉取详情（组件实例复用，避免状态残留）
    await loadDetail()
    window.dispatchEvent(
      new CustomEvent('global-tip', {
        detail: { type: 'tip', code: 'skill:update', message: '技能已保存' },
      }),
    )
  } catch (e) {
    window.dispatchEvent(
      new CustomEvent('global-tip', {
        detail: { type: 'error', code: 'skill:update', message: (e as Error).message ?? '保存失败' },
      }),
    )
  }
}

function cancelEdit() {
  editing.value = false
}

// ── 技能文件 ──

function goAddFile() {
  const profile = route.params.profile as string
  const skillId = route.params.skillId as string
  router.push(`/workspace/agents/${profile}/skill/${skillId}/file/new`)
}

function goEditFile(f: SkillFileInfo) {
  const profile = route.params.profile as string
  const skillId = route.params.skillId as string
  router.push(`/workspace/agents/${profile}/skill/${skillId}/file/${f.id}`)
}

async function handleDeleteFile(f: SkillFileInfo) {
  const ok = await confirm({
    title: '删除文件？',
    message: `确认删除文件「${f.name || f.fileType}」？此操作不可恢复。`,
    confirmText: '删除',
    destructive: true,
  })
  if (!ok) return
  try {
    await skillsApi.deleteSkillFile(f.id)
    files.value = files.value.filter((x) => x.id !== f.id)
    window.dispatchEvent(
      new CustomEvent('global-tip', {
        detail: { type: 'tip', code: 'skill:file-delete', message: '文件已删除' },
      }),
    )
  } catch (e) {
    window.dispatchEvent(
      new CustomEvent('global-tip', {
        detail: { type: 'error', code: 'skill:file-delete', message: (e as Error).message || '删除失败' },
      }),
    )
  }
}

async function handleDelete() {
  if (!skill.value) return
  const ok = await confirm({
    title: '删除技能？',
    message: `确认删除技能「${skill.value.displayName || skill.value.name}」？此操作不可恢复。`,
    confirmText: '删除',
    destructive: true,
  })
  if (!ok) return
  try {
    await skillsApi.deleteSkill(skill.value.id, route.params.profile as string)
    window.dispatchEvent(
      new CustomEvent('global-tip', {
        detail: { type: 'tip', code: 'skill:delete', message: '技能已删除' },
      }),
    )
    router.back()
  } catch (e) {
    window.dispatchEvent(
      new CustomEvent('global-tip', {
        detail: { type: 'error', code: 'skill:delete', message: (e as Error).message ?? '删除失败' },
      }),
    )
  }
}
</script>

<style scoped>
/* ── 头部 ── */

.skill-detail__header {
  display: flex;
  gap: 14px;
  margin-bottom: 16px;
}

.skill-detail__icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--tk-accent-light);
  color: var(--tk-accent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.skill-detail__heading {
  flex: 1;
  min-width: 0;
}

.skill-detail__heading h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--tk-text-primary);
}

.skill-detail__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.badge {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-secondary);
}

/* ── 信息段落 ── */

.detail-section {
  margin-bottom: 14px;
}

.detail-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.detail-section__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--tk-text-secondary);
  margin-bottom: 4px;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

.detail-section__value {
  font-size: 13px;
  color: var(--tk-text-primary);
  line-height: 1.6;
}

.detail-section__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-secondary);
  border: 1px solid var(--tk-border-light);
}

.detail-section__kv {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 12px;
}

.kv-label {
  font-weight: 600;
  color: var(--tk-text-secondary);
  flex-shrink: 0;
}

.kv-value {
  color: var(--tk-text-primary);
  word-break: break-all;
}

.detail-section__code {
  font-size: 12px;
  background: var(--tk-bg-secondary);
  padding: 10px 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
}

.detail-section__empty {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  font-style: italic;
}

.detail-section__rendered {
  font-size: 13px;
  line-height: 1.7;
}

.detail-section__body {
  font-size: 12px;
  background: var(--tk-bg-secondary);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
}

/* ── Markdown 切换 ── */

.markdown-toggle {
  display: flex;
  gap: 0;
  border: 1px solid var(--tk-border);
  border-radius: 6px;
  overflow: hidden;
}

.markdown-toggle__btn {
  font-size: 11px;
  padding: 3px 10px;
  border: none;
  background: transparent;
  color: var(--tk-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.markdown-toggle__btn.active {
  background: var(--tk-accent);
  color: #fff;
}

/* ── 更新时间 ── */

.skill-detail__updated {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid var(--tk-border-light);
}

/* ── 操作区（编辑/删除） ── */

.skill-detail__actions {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.action-btn {
  font-size: 12px;
  padding: 5px 14px;
  border-radius: 7px;
  border: 1px solid var(--tk-border);
  background: var(--tk-bg-secondary);
  color: var(--tk-text-primary);
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  border-color: var(--tk-accent);
  color: var(--tk-accent);
}

.action-btn--danger:hover {
  border-color: var(--tk-destructive);
  color: var(--tk-destructive);
}

/* ── 编辑模式 ── */

.detail-section__edit {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 一行两列（名称+分类 / 标签+平台）；窄屏 flex-wrap 自动换行 */
.edit-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.edit-col {
  flex: 1 1 200px;
  min-width: 0;
}

.edit-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  color: var(--tk-text-secondary);
  margin-bottom: 4px;
}

.field-input,
.field-select {
  width: 100%;
  font-size: 13px;
  padding: 7px 10px;
  border: 1px solid var(--tk-border);
  border-radius: 7px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-primary);
  outline: none;
}

.field-input:focus,
.field-select:focus {
  border-color: var(--tk-accent);
}

.field-editor {
  width: 100%;
  font-size: 13px;
  line-height: 1.6;
  padding: 8px 10px;
  border: 1px solid var(--tk-border);
  border-radius: 7px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-primary);
  resize: vertical;
  outline: none;
}

.field-editor:focus {
  border-color: var(--tk-accent);
}

.body-editor {
  width: 100%;
  min-height: 260px;
  font-family: var(--tk-font-mono);
  font-size: 12px;
  line-height: 1.6;
  padding: 10px 12px;
  border: 1px solid var(--tk-border);
  border-radius: 8px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-primary);
  resize: vertical;
  outline: none;
}

.body-editor:focus {
  border-color: var(--tk-accent);
}

.edit-actions {
  display: flex;
  gap: 8px;
}

/* ── 图标按钮（toolbar 编辑/删除） ── */

.icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--tk-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.icon-btn:hover {
  background: var(--tk-bg-secondary);
  color: var(--tk-accent);
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.icon-btn--danger:hover {
  color: var(--tk-destructive);
  background: rgba(255, 59, 48, 0.08);
}

/* ── 高级属性折叠（白卡片 + 四圆角——手风琴一体） ── */

.advanced-section {
  margin-top: 4px;
  margin-bottom: 14px;
  background: var(--tk-bg-elevated);
  border: 1px solid var(--tk-border-light);
  border-radius: 10px;
  overflow: hidden;
}

.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  font-size: 12px;
  font-weight: 600;
  color: var(--tk-text-secondary);
  background: transparent;
  border: none;
  padding: 10px 12px;
  cursor: pointer;
  text-align: left;
}

.advanced-toggle:hover {
  color: var(--tk-accent);
}

.advanced-chevron {
  font-size: 10px;
  transition: transform 0.18s;
  display: inline-block;
}

.advanced-chevron.open {
  transform: rotate(90deg);
}

.advanced-content {
  padding: 0 12px 12px;
}

/* ── 底部操作 ── */

.skill-detail__bottom-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--tk-border-light);
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

/* ── 骨架屏 ── */

.skill-detail__skeleton {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.skeleton-line,
.skeleton-block {
  background: var(--tk-bg-secondary);
  border-radius: 8px;
  position: relative;
  overflow: hidden;
}

.skeleton-line::after,
.skeleton-block::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
  animation: skeleton-shimmer 1.4s infinite;
}

.skeleton-line--title {
  width: 40%;
  height: 20px;
}

.skeleton-line--sub {
  width: 65%;
  height: 13px;
}

.skeleton-block--desc {
  height: 48px;
}

.skeleton-block {
  height: 120px;
}

@keyframes skeleton-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* ── 技能文件表格（手风琴——直接连折叠栏、宽度一致、无装饰） ── */

.file-content {
  padding: 0;
  box-sizing: border-box;
}

.file-table {
  display: flex;
  flex-direction: column;
}

.file-table__row {
  display: grid;
  grid-template-columns: 44px 1fr 90px 70px 50px 76px;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  font-size: 12px;
  border-top: 1px solid var(--tk-border-light);
  box-sizing: border-box;
  width: 100%;
}

.file-table__head {
  font-weight: 600;
  color: var(--tk-text-secondary);
}

.file-table__row:first-child {
  border-top: none;
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tk-text-primary);
}

.file-actions {
  display: flex;
  gap: 2px;
  justify-content: flex-end;
}

.file-empty {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  padding: 14px 4px;
  text-align: center;
}

.file-add-btn {
  margin-left: auto;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  background: var(--tk-bg-secondary);
  color: var(--tk-accent);
  cursor: pointer;
}

.file-add-btn:hover {
  background: var(--tk-accent);
  color: #fff;
}

/* ── 滚动条隐藏（技能详情页——内容较长时滚动条不显示） ── */

.skill-detail {
  max-width: 680px;
  width: 100%;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.skill-detail::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
</style>
