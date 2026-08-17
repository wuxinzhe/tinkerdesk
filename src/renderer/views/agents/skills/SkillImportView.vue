<template>
  <L3PageLayout class="skill-import" wide>
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><path d=&quot;M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4&quot;/><polyline points=&quot;7 10 12 15 17 10&quot;/><line x1=&quot;12&quot; y1=&quot;15&quot; x2=&quot;12&quot; y2=&quot;3&quot;/></svg>"
      gradient="linear-gradient(135deg, #bf7af6 0%, #af52de 100%)"
      title="创建技能"
      desc="创建或导入一个新技能"
    />
    <!-- L3 工具栏动作：导入 SKILL.md（文件选择 → 解析 → 可修改保存） -->
    <ToolbarActions>
      <button class="toolbar-btn" :disabled="loading" title="导入 SKILL.md" @click="handleImport">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <!-- emil 极简：文件轮廓（折角）+ 内部向下箭头（内容收进文件 = 导入） -->
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M12 12v6" />
          <path d="m9 15 3 3 3-3" />
        </svg>
      </button>
    </ToolbarActions>
    <!-- 技能导入/创建（解析在 render 层——可手动修改后保存） -->
    <div class="si">
      <div v-if="importedName" class="si__imported">
        已解析：{{ importedName }}（可手动修改后保存）
      </div>
      <div v-if="parseError" class="si__parse-error">
        ⚠️ {{ parseError }}
      </div>

      <!-- 技能表单（公共面板——基本信息 + 高级折叠 + 正文） -->
      <SkillFormPanel v-model:model="form" :categories="categories" />

      <!-- 附件 -->
      <div class="si__section">
        <div class="si__label">
          附件（{{ form.files.length }}）
        </div>
        <div v-if="form.files.length" class="si-files">
          <div v-for="(f, i) in form.files" :key="i" class="si-file">
            <span class="si-file__name">{{ f.name || f.fileType }}</span>
            <span class="si-file__type">{{ f.fileType }}</span>
            <button class="icon-btn icon-btn--danger" title="移除" @click="form.files.splice(i, 1)">
              ✕
            </button>
          </div>
        </div>
        <div v-else class="si__files-empty">
          无附件——导入文件夹时自动收集 references/scripts/templates
        </div>
      </div>

      <div class="si__actions">
        <button class="action-btn action-btn--primary" :disabled="saving" @click="handleSave">
          {{ saving ? '保存中…' :
            '保存技能' }}
        </button>
        <button class="action-btn" @click="goBack">
          取消
        </button>
      </div>
    </div>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { skillsApi } from '@/renderer/api/skills-api'
import { L3PageLayout, SaPageHero } from '@/renderer/components'
import ToolbarActions from '@/renderer/components/workspace/ToolbarActions.vue'
import { parseSkillMarkdown } from '@/renderer/utils/skill-parser'
import SkillFormPanel from '@/renderer/views/agents/skills/SkillFormPanel.vue'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

interface SkillImportForm {
  name: string
  displayName: string
  description: string
  category: string
  version: string
  author: string
  license: string
  platforms: string
  tags: string
  dependencies: string
  requiresToolsets: string
  requiresTools: string
  fallbackForToolsets: string
  fallbackForTools: string
  triggers: string
  triggerConditions: string
  /** 关联技能名数组（导入解析 related: [name...]） */
  related?: string[]
  config: string
  envVars: string
  commands: string
  compatibility: string
  allowedTools: string
  metadata: string
  body: string
  files: Array<{ fileType: string; name: string; content: string; sortOrder: number }>
}

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const saving = ref(false)
const importedName = ref('')
const parseError = ref('')
const categories = ref<Array<{ name: string; displayName?: string }>>([])

const emptyForm = (): SkillImportForm => ({
  name: '', displayName: '', description: '', category: '', version: '', author: '', license: '',
  platforms: '', tags: '', dependencies: '', requiresToolsets: '', requiresTools: '',
  fallbackForToolsets: '', fallbackForTools: '', triggers: '', triggerConditions: '',
  config: '[]', envVars: '', commands: '', compatibility: '', allowedTools: '', metadata: '{}', body: '', files: [],
})

const form = ref<SkillImportForm>(emptyForm())

onMounted(async () => {
  try {
    categories.value = await skillsApi.categories()
  } catch {
    categories.value = []
  }
})

/** 导入：选文件夹 → 前端解析 SKILL.md → 填表单（可手动修改） */
async function handleImport() {
  if (loading.value) return
  loading.value = true
  parseError.value = ''
  try {
    const file = await window.api.skills.pickInstallFile()
    if (!file) return
    const parsed = parseSkillMarkdown(file.content)
    if (!parsed.ok) {
      parseError.value = parsed.error ?? '解析失败'
      return
    }
    form.value = {
      name: parsed.name ?? '',
      displayName: parsed.displayName ?? '',
      description: parsed.description ?? '',
      category: parsed.category ?? '',
      version: parsed.version ?? '',
      author: parsed.author ?? '',
      license: parsed.license ?? '',
      platforms: parsed.platforms ?? '',
      tags: parsed.tags ?? '',
      dependencies: parsed.dependencies ?? '',
      requiresToolsets: parsed.requiresToolsets ?? '',
      requiresTools: parsed.requiresTools ?? '',
      fallbackForToolsets: parsed.fallbackForToolsets ?? '',
      fallbackForTools: parsed.fallbackForTools ?? '',
      triggers: parsed.triggers ?? '',
      triggerConditions: parsed.triggerConditions ?? '',
      config: parsed.config ?? '[]',
      envVars: parsed.envVars ?? '',
      commands: parsed.commands ?? '',
      compatibility: parsed.compatibility ?? '',
      allowedTools: parsed.allowedTools ?? '',
      metadata: parsed.metadata ?? '{}',
      body: parsed.body,
      files: file.files.map((f, i) => ({ fileType: f.fileType, name: f.name, content: f.content, sortOrder: f.sortOrder ?? i })),
    }
    importedName.value = parsed.name ?? ''
  } catch (e) {
    parseError.value = (e as Error).message ?? '读取失败'
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  if (saving.value) return
  const f = form.value
  if (!f.name.trim() || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.name.trim())) {
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'skill:import:invalid_name', message: 'name 缺失或非法（小写字母/数字/连字符）' } }))
    return
  }
  if (!f.body.trim()) {
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'skill:import:empty_body', message: '正文不能为空' } }))
    return
  }
  // 长度校验（与后端一致）
  const MAX_BODY = 50 * 1024
  const MAX_FILE = 256 * 1024
  if (f.body.length > MAX_BODY) {
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'skill:import:body_too_long', message: `正文过长（${f.body.length} 字符，上限 ${MAX_BODY}）——请精简或拆分为附件` } }))
    return
  }
  for (const file of f.files) {
    if ((file.content ?? '').length > MAX_FILE) {
      window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'skill:import:file_too_long', message: `附件「${file.name || file.fileType}」过长（上限 ${MAX_FILE} 字符）` } }))
      return
    }
  }
  saving.value = true
  try {
    const profile = route.params.profile as string
    const info = await skillsApi.installFromMarkdown({
      profile,
      name: f.name.trim(),
      displayName: f.displayName.trim(),
      description: f.description.trim(),
      category: f.category,
      version: f.version.trim(),
      author: f.author.trim(),
      license: f.license.trim(),
      platforms: f.platforms.trim(),
      tags: f.tags.trim(),
      dependencies: f.dependencies.trim(),
      requiresToolsets: f.requiresToolsets.trim(),
      requiresTools: f.requiresTools.trim(),
      fallbackForToolsets: f.fallbackForToolsets.trim(),
      fallbackForTools: f.fallbackForTools.trim(),
      triggers: f.triggers.trim(),
      triggerConditions: f.triggerConditions.trim(),
      config: f.config.trim() || '[]',
      envVars: f.envVars.trim(),
      commands: f.commands.trim(),
      body: f.body,
      // reactive 代理对象无法过 IPC structured clone（DataCloneError）——展开为普通对象
      files: f.files.map((file) => ({ fileType: file.fileType, name: file.name, content: file.content, sortOrder: file.sortOrder })),
      related: f.related ?? undefined,
    })
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'tip', code: 'skill:import:saved', message: `技能「${info.displayName}」已保存` } }))
    goBack()
  } catch (e) {
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'skill:import:save_failed', message: (e as Error).message ?? '保存失败' } }))
  } finally {
    saving.value = false
  }
}

function goBack() {
  const profile = route.params.profile as string
  router.push(`/workspace/agents/${profile}/skills`)
}
</script>

<style scoped>
/* 注意：padding 由 L3PageLayout 统一提供（20px 24px）——此处不定义 */
.skill-import {
  width: 100%;
}
.si {
  /* 宽度由 L3PageLayout（680）统一 */
}

/* L3 工具栏图标按钮（emil：主入口图标按钮——hairline 边框 + 白底浮起，
   与 Agent List 加号同款） */
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
.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
@media (hover: hover) and (pointer: fine) {
  .toolbar-btn:hover {
    background: var(--tk-bg-secondary);
    box-shadow: var(--tk-shadow-card-hover);
  }
}

.si__imported {
  font-size: 12px;
  color: var(--tk-accent);
  margin-bottom: 10px;
}

.si__parse-error {
  font-size: 12px;
  color: var(--tk-destructive);
  background: rgba(255, 59, 48, 0.08);
  padding: 8px 10px;
  border-radius: 8px;
  margin-bottom: 10px;
}

.si__section {
  margin-bottom: 14px;
}

.si__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--tk-text-secondary);
  margin-bottom: 8px;
}

.si-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.si__field {
  flex: 1 1 200px;
  min-width: 0;
}

.si__field-label {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  margin-bottom: 4px;
}

.si__input {
  width: 100%;
  font-size: 13px;
  padding: 7px 10px;
  border: 1px solid var(--tk-border);
  border-radius: 7px;
  /* 略深于页面背景——便于辨别 */
  background: rgba(0, 0, 0, 0.04);
  color: var(--tk-text-primary);
  outline: none;
  box-sizing: border-box;
}

.si__input:focus {
  border-color: var(--tk-accent);
}

html[data-theme='dark'] .si__input,
html[data-theme='dark'] .si__textarea,
html[data-theme='dark'] .si__body {
  background: rgba(255, 255, 255, 0.06);
}

.si__textarea,
.si__body {
  width: 100%;
  font-size: 13px;
  font-family: inherit;
  padding: 8px 10px;
  border: 1px solid var(--tk-border);
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.04);
  color: var(--tk-text-primary);
  outline: none;
  resize: vertical;
  line-height: 1.5;
  box-sizing: border-box;
}

.si__textarea:focus,
.si__body:focus {
  border-color: var(--tk-accent);
}

.si-files {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.si-file {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border: 1px solid var(--tk-border-light);
  border-radius: 8px;
  background: var(--tk-bg-secondary);
}

.si-file__name {
  flex: 1;
  font-size: 13px;
  color: var(--tk-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.si-file__type {
  font-size: 11px;
  color: var(--tk-text-tertiary);
}

.si__files-empty {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  padding: 8px 0;
}

.si__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--tk-border-light);
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

.icon-btn {
  border: none;
  background: transparent;
  color: var(--tk-text-tertiary);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
}

.icon-btn--danger:hover {
  color: var(--tk-destructive);
}

/* 高级折叠（白卡片） */
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
  padding: 4px 12px 12px;
}
</style>
