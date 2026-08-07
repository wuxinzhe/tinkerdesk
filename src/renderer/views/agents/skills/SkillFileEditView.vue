<template>
  <L3PageLayout class="skill-file-edit">
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
import { L3PageLayout } from '@/renderer/components'

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
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'sfe', message: '文件类型不能为空' } }))
    return
  }
  saving.value = true
  try {
    const profile = route.params.profile as string
    const skillId = route.params.skillId as string
    if (isEdit.value) {
      await skillsApi.updateSkillFile({ id: Number(route.params.fileId), ...form.value })
    } else {
      await skillsApi.addSkillFile({ skillId, ...form.value })
    }
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'tip', code: 'sfe', message: isEdit.value ? '文件已更新' : '文件已新增' } }))
    goBack()
  } catch (e) {
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'sfe', message: (e as Error).message || '保存失败' } }))
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
  padding: 20px 24px;
}

.sfe {
  max-width: 640px;
}

.sfe__heading {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--sa-text-primary, #1d1d1f);
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
  color: var(--sa-text-secondary, #86868b);
}

.sfe__input {
  width: 100%;
  font-size: 13px;
  padding: 7px 10px;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 7px;
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-text-primary, #1d1d1f);
  outline: none;
}

.sfe__input:focus {
  border-color: var(--sa-accent, #007aff);
}

.sfe__textarea {
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
}

.sfe__textarea:focus {
  border-color: var(--sa-accent, #007aff);
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
</style>
