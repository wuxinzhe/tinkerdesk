<template>
  <div class="agent-detail">
    <div class="agent-detail__body">
      <!-- ══════════ 编辑表单 ══════════ -->
      <div v-if="!isCreate && editingAgent" class="edit-form">
        <div class="edit-form__section">
          <div class="edit-form__section-label">基本信息</div>
          <div class="edit-form__group">
            <label class="edit-form__label">名称 <span class="required">*</span></label>
            <input v-model="form.displayName" class="edit-form__input" placeholder="Agent 名称" />
            <p v-if="editNameError" class="edit-form__field-error">{{ editNameError }}</p>
          </div>
          <div class="edit-form__group">
            <label class="edit-form__label">简介</label>
            <input v-model="form.description" class="edit-form__input" placeholder="简短描述" />
          </div>
          <div class="edit-form__group">
            <label class="edit-form__label">头像 URL</label>
            <input v-model="form.avatar" class="edit-form__input" placeholder="可选，图片 URL" />
          </div>
        </div>
        <div class="edit-form__section-divider" />
        <div class="edit-form__section">
          <div class="edit-form__section-label">配置</div>
          <div class="edit-form__group">
            <label class="edit-form__label">模式</label>
            <div class="edit-form__select-wrapper">
              <select v-model="form.agentModeId" class="edit-form__select">
                <option v-for="opt in modeOptions" :key="opt.id" :value="opt.id">{{ opt.id }}</option>
              </select>
              <svg class="edit-form__select-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9" /></svg>
            </div>
          </div>
          <div class="edit-form__group">
            <label class="edit-form__label">版本</label>
            <div class="edit-form__select-wrapper">
              <select v-model="form.agentModeVersion" class="edit-form__select">
                <option v-for="v in currentModeVersions" :key="v" :value="v">{{ v }}</option>
              </select>
              <svg class="edit-form__select-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9" /></svg>
            </div>
          </div>
        </div>
        <div class="edit-form__actions">
          <button class="edit-form__btn primary" :disabled="saving" @click="saveEdit">
            {{ saving ? '保存中...' : '保存' }}
          </button>
          <button class="edit-form__btn subtle" :disabled="saving" @click="backToList">取消</button>
          <button v-if="!editingAgent.isDefault" class="edit-form__btn danger" :disabled="deleting" @click="deleteAgent(editingAgent)">
            删除
          </button>
        </div>
        <p v-if="editError" class="edit-form__error">{{ editError }}</p>
      </div>

      <!-- ══════════ 创建表单 ══════════ -->
      <div v-else-if="isCreate" class="edit-form">
        <div class="edit-form__section">
          <div class="edit-form__section-label">基本信息</div>
          <div class="edit-form__group">
            <label class="edit-form__label">标识 (profile) <span class="required">*</span></label>
            <input v-model="createForm.profile" class="edit-form__input" placeholder="英文字母，最长 15 字符" />
            <p v-if="profileError" class="edit-form__field-error">{{ profileError }}</p>
          </div>
          <div class="edit-form__group">
            <label class="edit-form__label">名称 <span class="required">*</span></label>
            <input v-model="createForm.displayName" class="edit-form__input" placeholder="Agent 名称" />
            <p v-if="createNameError" class="edit-form__field-error">{{ createNameError }}</p>
          </div>
          <div class="edit-form__group">
            <label class="edit-form__label">简介</label>
            <input v-model="createForm.description" class="edit-form__input" placeholder="简短描述" />
          </div>
          <div class="edit-form__group">
            <label class="edit-form__label">头像 URL</label>
            <input v-model="createForm.avatar" class="edit-form__input" placeholder="可选，图片 URL" />
          </div>
        </div>
        <div class="edit-form__section-divider" />
        <div class="edit-form__section">
          <div class="edit-form__section-label">配置</div>
          <div class="edit-form__group">
            <label class="edit-form__label">模式</label>
            <div class="edit-form__select-wrapper">
              <select v-model="createForm.agentModeId" class="edit-form__select">
                <option v-for="opt in modeOptions" :key="opt.id" :value="opt.id">{{ opt.id }}</option>
              </select>
              <svg class="edit-form__select-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9" /></svg>
            </div>
          </div>
          <div class="edit-form__group">
            <label class="edit-form__label">版本</label>
            <div class="edit-form__select-wrapper">
              <select v-model="createForm.agentModeVersion" class="edit-form__select">
                <option v-for="v in createModeVersions" :key="v" :value="v">{{ v }}</option>
              </select>
              <svg class="edit-form__select-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9" /></svg>
            </div>
          </div>
        </div>
        <div class="edit-form__actions">
          <button class="edit-form__btn primary" :disabled="saving || !createFormValid" @click="saveCreate">
            {{ saving ? '创建中...' : '创建' }}
          </button>
          <button class="edit-form__btn subtle" :disabled="saving" @click="backToList">取消</button>
        </div>
        <p v-if="editError" class="edit-form__error">{{ editError }}</p>
      </div>

      <!-- ══════════ 占位 ══════════ -->
      <div v-else class="agents-placeholder">
        <div class="agents-placeholder__inner">
          <div class="agents-placeholder__icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
          </div>
          <p class="agents-placeholder__text">选择一个 Agent 进行管理</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AgentInfo, ModeOptionVO } from '@/renderer/api/types'
import { agentsApi } from '@/renderer/api/agents-api'

const route = useRoute()
const router = useRouter()

const isCreate = computed(() => route.path.includes('/agents/create'))
const detailProfile = computed(() => route.params.profile as string | undefined)

function backToList() {
  router.push('/workspace/agents')
}

/* ── Agent 数据 ── */
const editingAgent = ref<AgentInfo | null>(null)
let agentCache = new Map<string, AgentInfo>()

async function ensureAgent(profile: string): Promise<AgentInfo | null> {
  if (agentCache.has(profile)) return agentCache.get(profile)!
  try {
    const agent = await agentsApi.get(profile)
    if (agent) {
      agentCache.set(profile, agent)
      return agent
    }
  } catch { /* ignore */ }
  return null
}

/* ── Edit form ── */
const form = ref({
  displayName: '', description: '', avatar: '',
  agentModeId: '', agentModeVersion: ''
})
const saving = ref(false)
const deleting = ref(false)
const editError = ref('')

const editNameError = computed(() => {
  if (!form.value.displayName || !form.value.displayName.trim()) return '名称不能为空'
  return ''
})

/* ── Create form ── */
const createForm = ref({
  profile: '', displayName: '', description: '', avatar: '',
  agentModeId: '', agentModeVersion: ''
})

const PROFILE_RE = /^[a-zA-Z]+$/
const PROFILE_MAX = 15

const profileError = computed(() => {
  const v = createForm.value.profile
  if (!v) return ''
  if (v.length > PROFILE_MAX) return `标识不能超过 ${PROFILE_MAX} 个字符`
  if (!PROFILE_RE.test(v)) return '标识只能包含英文字母'
  return ''
})

const createNameError = computed(() => {
  if (!createForm.value.displayName || !createForm.value.displayName.trim()) return '名称不能为空'
  return ''
})

const createFormValid = computed(() => {
  return createForm.value.profile.trim() !== ''
    && !profileError.value
    && createForm.value.displayName.trim() !== ''
})

/* ── Mode options ── */
const modeOptions = ref<ModeOptionVO[]>([])

const currentModeVersions = computed(() => {
  const id = form.value.agentModeId
  const opt = modeOptions.value.find(o => o.id === id)
  return opt ? opt.versions : []
})

const createModeVersions = computed(() => {
  const id = createForm.value.agentModeId
  const opt = modeOptions.value.find(o => o.id === id)
  return opt ? opt.versions : []
})

async function loadModeOptions() {
  try {
    const res = (await agentsApi.listModes(true)) as ModeOptionVO[]
    modeOptions.value = res ?? []
  } catch { /* silent */ }
}

/* ── Actions ── */

async function saveEdit() {
  if (!editingAgent.value) return
  saving.value = true
  editError.value = ''
  try {
    const updated = await agentsApi.update(editingAgent.value.profile, {
      displayName: form.value.displayName || undefined,
      description: form.value.description || undefined,
      avatar: form.value.avatar || undefined,
      agentModeId: form.value.agentModeId || undefined,
      agentModeVersion: form.value.agentModeVersion || undefined
    })
    if (updated) editingAgent.value = updated
    backToList()
  } catch (e) {
    editError.value = (e as Error).message ?? '保存失败'
  } finally {
    saving.value = false
  }
}

async function saveCreate() {
  if (!createForm.value.profile.trim() || profileError.value || !createForm.value.displayName.trim()) {
    editError.value = '请检查表单：标识和名称必须填写且格式正确'
    return
  }
  saving.value = true
  editError.value = ''
  try {
    const created = await agentsApi.create({
      profile: createForm.value.profile.trim(),
      displayName: createForm.value.displayName || createForm.value.profile.trim(),
      description: createForm.value.description || undefined,
      avatar: createForm.value.avatar || undefined,
      agentModeId: createForm.value.agentModeId || undefined,
      agentModeVersion: createForm.value.agentModeVersion || undefined
    })
    backToList()
  } catch (e) {
    editError.value = (e as Error).message ?? '创建失败'
  } finally {
    saving.value = false
  }
}

async function deleteAgent(a: AgentInfo) {
  if (deleting.value) return
  if (!confirm(`确定删除 Agent "${a.displayName}"？此操作不可撤销。`)) return
  deleting.value = true
  try {
    await agentsApi.delete(a.profile)
    agentCache.delete(a.profile)
    backToList()
  } catch { /* silent */
  } finally {
    deleting.value = false
  }
}

/* ── 路由变化 → 同步 ── */
async function syncFromRoute() {
  const profile = detailProfile.value
  const creating = isCreate.value

  if (creating) {
    await loadModeOptions()
    const first = modeOptions.value[0]
    createForm.value = {
      profile: '', displayName: '', description: '', avatar: '',
      agentModeId: first ? first.id : '',
      agentModeVersion: first ? first.versions[0] : ''
    }
    editError.value = ''
    return
  }

  if (!profile) return

  const agent = await ensureAgent(profile)
  if (!agent) return

  // Edit mode
  await loadModeOptions()
  editingAgent.value = agent
  form.value = {
    displayName: agent.displayName ?? '',
    description: agent.description ?? '',
    avatar: agent.avatar ?? '',
    agentModeId: agent.agentModeId ?? '',
    agentModeVersion: agent.agentModeVersion ?? ''
  }
  editError.value = ''
}

watch([() => route.params.profile, () => route.path], syncFromRoute)

watch(isCreate, (val) => {
  if (!val) syncFromRoute()
})

onMounted(() => syncFromRoute())
</script>

<style scoped>
.agent-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.agent-detail__body {
  flex: 1;
  overflow-y: auto;
  background: var(--sa-bg-primary, #ffffff);
}

.agents-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.agents-placeholder__inner {
  text-align: center;
}
.agents-placeholder__icon-wrap {
  display: inline-flex;
  padding: 12px;
  border-radius: 12px;
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-text-tertiary, #aeaeb2);
  margin-bottom: 12px;
}
.agents-placeholder__text {
  font-size: 14px;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.edit-form {
  padding: 24px 32px;
  max-width: 560px;
}
.edit-form__section {
  margin-bottom: 20px;
}
.edit-form__section-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--sa-text-secondary, #86868b);
  margin-bottom: 12px;
  letter-spacing: 0.3px;
}
.edit-form__section-divider {
  height: 1px;
  background: var(--sa-border, #d2d2d7);
  margin: 16px 0 20px;
}
.edit-form__group {
  margin-bottom: 12px;
}
.edit-form__label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--sa-text-primary, #1d1d1f);
  margin-bottom: 4px;
}
.required { color: #ff3b30; }
.edit-form__field-error {
  font-size: 12px;
  color: #ff3b30;
  margin: 2px 0 0;
}
.edit-form__input,
.edit-form__textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  color: var(--sa-text-primary, #1d1d1f);
  background: var(--sa-bg-primary, #fff);
  outline: none;
  transition: border-color 0.15s;
}
.edit-form__input:focus,
.edit-form__textarea:focus {
  border-color: var(--sa-accent, #007aff);
}
.edit-form__textarea {
  resize: vertical;
  min-height: 100px;
}
.edit-form__select-wrapper {
  position: relative;
}
.edit-form__select {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 8px;
  padding: 8px 32px 8px 12px;
  font-size: 13px;
  font-family: inherit;
  color: var(--sa-text-primary, #1d1d1f);
  background: var(--sa-bg-primary, #fff);
  outline: none;
  appearance: none;
  cursor: pointer;
}
.edit-form__select-chevron {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--sa-text-tertiary, #aeaeb2);
  pointer-events: none;
}
.edit-form__actions {
  display: flex;
  gap: 8px;
  margin-top: 20px;
}
.edit-form__btn {
  all: unset;
  cursor: pointer;
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  transition: opacity 0.15s;
}
.edit-form__btn:disabled { opacity: 0.5; cursor: default; }
.edit-form__btn.primary {
  background: var(--sa-accent, #007aff);
  color: #fff;
}
.edit-form__btn.subtle {
  color: var(--sa-text-primary, #1d1d1f);
  border: 1px solid var(--sa-border, #d2d2d7);
}
.edit-form__btn.danger {
  margin-left: auto;
  color: #ff3b30;
  border: 1px solid #ff3b30;
}
.edit-form__error {
  font-size: 13px;
  color: #ff3b30;
  margin: 12px 0 0;
}
</style>
