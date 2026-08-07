<template>
  <L3PageLayout class="skill-import">
    <!-- 技能导入/创建（解析在 render 层——可手动修改后保存） -->
    <div class="si">
      <div class="si__heading">导入 / 创建技能</div>

      <!-- 导入操作 -->
      <div class="si__import-row">
        <button class="action-btn" :disabled="loading" @click="handleImport">
          {{ loading ? '解析中…' : '📂 导入 SKILL.md（文件夹）' }}
        </button>
        <span v-if="importedName" class="si__imported">已解析：{{ importedName }}（可手动修改后保存）</span>
      </div>
      <div v-if="parseError" class="si__parse-error">⚠️ {{ parseError }}</div>

      <!-- 技能表单（公共面板——基本信息 + 高级折叠 + 正文） -->
      <SkillFormPanel v-model:model="form" :categories="categories" />

      <!-- 附件 -->
      <div class="si__section">
        <div class="si__label">附件（{{ form.files.length }}）</div>
        <div v-if="form.files.length" class="si-files">
          <div v-for="(f, i) in form.files" :key="i" class="si-file">
            <span class="si-file__name">{{ f.name || f.fileType }}</span>
            <span class="si-file__type">{{ f.fileType }}</span>
            <button class="icon-btn icon-btn--danger" title="移除" @click="form.files.splice(i, 1)">✕</button>
          </div>
        </div>
        <div v-else class="si__files-empty">无附件——导入文件夹时自动收集 references/scripts/templates</div>
      </div>

      <div class="si__actions">
        <button class="action-btn action-btn--primary" :disabled="saving" @click="handleSave">{{ saving ? '保存中…' : '保存技能' }}</button>
        <button class="action-btn" @click="goBack">取消</button>
      </div>
    </div>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { skillsApi } from '@/renderer/api/skills-api'
import { parseSkillMarkdown } from '@/renderer/utils/skill-parser'
import { L3PageLayout } from '@/renderer/components'
import SkillFormPanel from '@/renderer/views/agents/skills/SkillFormPanel.vue'
import type { SkillFormModel } from '@/renderer/views/agents/skills/SkillFormPanel.vue'

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
  config: string
  envVars: string
  commands: string
  body: string
  files: Array<{ fileType: string; name: string; content: string; sortOrder: number }>
}

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const saving = ref(false)
const advancedOpen = ref(false)
const importedName = ref('')
const parseError = ref('')
const categories = ref<Array<{ name: string; displayName?: string }>>([])

const emptyForm = (): SkillImportForm => ({
  name: '', displayName: '', description: '', category: '', version: '', author: '', license: '',
  platforms: '', tags: '', dependencies: '', requiresToolsets: '', requiresTools: '',
  fallbackForToolsets: '', fallbackForTools: '', triggers: '', triggerConditions: '',
  config: '[]', envVars: '', commands: '', body: '', files: [],
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
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'si', message: 'name 缺失或非法（小写字母/数字/连字符）' } }))
    return
  }
  if (!f.body.trim()) {
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'si', message: '正文不能为空' } }))
    return
  }
  // 长度校验（与后端一致）
  const MAX_BODY = 50 * 1024
  const MAX_FILE = 256 * 1024
  if (f.body.length > MAX_BODY) {
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'si', message: `正文过长（${f.body.length} 字符，上限 ${MAX_BODY}）——请精简或拆分为附件` } }))
    return
  }
  for (const file of f.files) {
    if ((file.content ?? '').length > MAX_FILE) {
      window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'si', message: `附件「${file.name || file.fileType}」过长（上限 ${MAX_FILE} 字符）` } }))
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
      files: f.files,
    })
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'tip', code: 'si', message: `技能「${info.displayName}」已保存` } }))
    goBack()
  } catch (e) {
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'si', message: (e as Error).message ?? '保存失败' } }))
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
.skill-import {
  padding: 20px 24px;
}

.si {
  max-width: 720px;
}

.si__heading {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 14px;
  color: var(--sa-text-primary, #1d1d1f);
}

.si__import-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.si__imported {
  font-size: 12px;
  color: var(--sa-accent, #007aff);
}

.si__parse-error {
  font-size: 12px;
  color: #ff3b30;
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
  color: var(--sa-text-secondary, #86868b);
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
  color: var(--sa-text-tertiary, #aeaeb2);
  margin-bottom: 4px;
}

.si__input {
  width: 100%;
  font-size: 13px;
  padding: 7px 10px;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 7px;
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-text-primary, #1d1d1f);
  outline: none;
  box-sizing: border-box;
}

.si__input:focus {
  border-color: var(--sa-accent, #007aff);
}

.si__textarea,
.si__body {
  width: 100%;
  font-size: 13px;
  font-family: inherit;
  padding: 8px 10px;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 7px;
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-text-primary, #1d1d1f);
  outline: none;
  resize: vertical;
  line-height: 1.5;
  box-sizing: border-box;
}

.si__textarea:focus,
.si__body:focus {
  border-color: var(--sa-accent, #007aff);
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
  border: 1px solid var(--sa-border-light, #e8e8ed);
  border-radius: 8px;
  background: var(--sa-bg-secondary, #f5f5f7);
}

.si-file__name {
  flex: 1;
  font-size: 13px;
  color: var(--sa-text-primary, #1d1d1f);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.si-file__type {
  font-size: 11px;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.si__files-empty {
  font-size: 12px;
  color: var(--sa-text-tertiary, #aeaeb2);
  padding: 8px 0;
}

.si__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--sa-border-light, #e8e8ed);
}

.action-btn {
  padding: 7px 16px;
  font-size: 13px;
  border-radius: 8px;
  border: 1px solid var(--sa-border, #d2d2d7);
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-text-primary, #1d1d1f);
  cursor: pointer;
}

.action-btn:hover {
  border-color: var(--sa-accent, #007aff);
  color: var(--sa-accent, #007aff);
}

.action-btn--primary {
  background: var(--sa-accent, #007aff);
  border-color: var(--sa-accent, #007aff);
  color: #fff;
}

.action-btn--primary:hover {
  background: var(--sa-accent-hover, #0071e3);
  color: #fff;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.icon-btn {
  border: none;
  background: transparent;
  color: var(--sa-text-tertiary, #aeaeb2);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
}

.icon-btn--danger:hover {
  color: #ff3b30;
}

/* 高级折叠（白卡片） */
.advanced-section {
  margin-top: 4px;
  margin-bottom: 14px;
  background: var(--sa-bg-elevated, #ffffff);
  border: 1px solid var(--sa-border-light, #e8e8ed);
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
  color: var(--sa-text-secondary, #86868b);
  background: transparent;
  border: none;
  padding: 10px 12px;
  cursor: pointer;
  text-align: left;
}

.advanced-toggle:hover {
  color: var(--sa-accent, #007aff);
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
