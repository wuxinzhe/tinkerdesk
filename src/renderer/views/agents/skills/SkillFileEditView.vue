<template>
  <L3PageLayout class="skill-file-edit">
    <!-- 页头 -->
    <SaPageHero
      icon='<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
      gradient="linear-gradient(135deg, #5ac8fa 0%, var(--tk-accent) 100%)"
      title="技能文件"
      desc="编辑技能的说明文件"
    />
    <!-- 新增/编辑技能文件 -->
    <div class="sfe">
      <div class="sfe__heading">{{ isEdit ? '编辑文件' : '新增文件' }}</div>

      <div class="sfe__section">
        <div class="sfe__label">文件类型</div>
        <select v-model="form.fileType" class="sfe__input">
          <option value="references">references</option>
          <option value="scripts">scripts</option>
          <option value="templates">templates</option>
          <option value="assets">assets</option>
          <option value="other">other</option>
        </select>
      </div>

      <div class="sfe__section">
        <div class="sfe__label">文件名</div>
        <input v-model="form.name" class="sfe__input" placeholder="如: guide.md" />
      </div>

      <div class="sfe-row">
        <div class="sfe__section">
          <div class="sfe__label">语言</div>
          <input v-model="form.language" class="sfe__input" placeholder="如: markdown, ts" />
        </div>
        <div class="sfe__section">
          <div class="sfe__label">排序</div>
          <input v-model.number="form.sortOrder" type="number" class="sfe__input" />
        </div>
      </div>

      <div class="sfe__section">
        <div class="sfe__label">内容</div>
        <textarea v-model="form.content" class="sfe__textarea" rows="14" spellcheck="false" placeholder="文件正文内容"></textarea>
      </div>

      <div class="sfe__actions">
        <button class="action-btn action-btn--primary" :disabled="saving" @click="handleSave">{{ saving ? '保存中…' : '保存' }}</button>
        <button class="action-btn" @click="goBack">取消</button>
      </div>
    </div>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { skillsApi } from '@/renderer/api/skills-api'
import { L3PageLayout, SaPageHero } from '@/renderer/components'

const router = useRouter()
const route = useRoute()
const saving = ref(false)
const isEdit = computed(() => (route.params.fileId as string) !== 'new')
const form = ref({ fileType: 'references', name: '', language: '', sortOrder: 0, content: '' })

onMounted(async () => {
  if (isEdit.value) {
    const skillId = route.params.skillId as string
    const fileId = Number(route.params.fileId)
    try {
      const list = await skillsApi.listSkillFiles(skillId)
      const f = list.find((x) => x.id === fileId)
      if (f) {
        form.value = { fileType: f.fileType, name: f.name ?? '', language: f.language ?? '', sortOrder: f.sortOrder ?? 0, content: f.content ?? '' }
      }
    } catch {
      // 加载失败保持空表单
    }
  }
})

async function handleSave() {
  if (!form.value.fileType.trim()) {
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'skill:file:invalid_type', message: '文件类型不能为空' } }))
    return
  }
  saving.value = true
  try {
    const skillId = route.params.skillId as string
    if (isEdit.value) {
      await skillsApi.updateSkillFile({ id: Number(route.params.fileId), ...form.value })
    } else {
      await skillsApi.addSkillFile({ skillId, ...form.value })
    }
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'tip', code: 'skill:file:saved', message: isEdit.value ? '文件已更新' : '文件已新增' } }))
    goBack()
  } catch (e) {
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'skill:file:save_failed', message: (e as Error).message || '保存失败' } }))
  } finally {
    saving.value = false
  }
}

function goBack() {
  const profile = route.params.profile as string
  const skillId = route.params.skillId as string
  router.push(`/workspace/agents/${profile}/skill/${skillId}`)
}
</script>

<style scoped>
.skill-file-edit {
  /* padding 由 L3PageLayout 统一提供 */
  max-width: 680px;
  width: 100%;
}

.sfe {
  /* 宽度由 L3PageLayout（680）统一——此处不限制 */
}

.sfe__heading {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--tk-text-primary);
}

.sfe__section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.sfe-row {
  display: flex;
  gap: 12px;
}

.sfe-row .sfe__section {
  flex: 1;
}

.sfe__label {
  font-size: 12px;
  color: var(--tk-text-secondary);
}

.sfe__input {
  width: 100%;
  font-size: 13px;
  padding: 7px 10px;
  border: 1px solid var(--tk-border);
  border-radius: 7px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-primary);
  outline: none;
}

.sfe__input:focus {
  border-color: var(--tk-accent);
}

.sfe__textarea {
  width: 100%;
  font-size: 13px;
  font-family: inherit;
  padding: 8px 10px;
  border: 1px solid var(--tk-border);
  border-radius: 7px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-primary);
  outline: none;
  resize: vertical;
  line-height: 1.5;
}

.sfe__textarea:focus {
  border-color: var(--tk-accent);
}

.sfe__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
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
</style>
