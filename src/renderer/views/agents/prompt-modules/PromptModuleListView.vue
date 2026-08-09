<template>
  <div class="prompt-modules">
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><path d=&quot;M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z&quot;/><polyline points=&quot;14 2 14 8 20 8&quot;/><line x1=&quot;8&quot; y1=&quot;13&quot; x2=&quot;16&quot; y2=&quot;13&quot;/><line x1=&quot;8&quot; y1=&quot;17&quot; x2=&quot;13&quot; y2=&quot;17&quot;/></svg>"
      gradient="linear-gradient(135deg, #ffb340 0%, var(--tk-warning) 100%)"
      title="提示词模块"
      desc="管理 Agent 的提示词模块"
    />
    <div class="prompt-modules__header">
      <button class="prompt-modules__add-btn" @click="openCreate">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        新增
      </button>
    </div>

    <div v-if="loading" class="prompt-modules__loading">
      加载中...
    </div>

    <div v-else-if="modules.length === 0" class="prompt-modules__empty">
      <p>暂无提示词模块</p>
      <p class="prompt-modules__empty-hint">
        点击「新增」添加自定义提示词，将拼入 Agent 的 system prompt
      </p>
    </div>

    <div v-else class="prompt-modules__list">
      <div
        v-for="mod in modules"
        :key="mod.id"
        class="prompt-module-item"
      >
        <div class="prompt-module-item__body">
          <div class="prompt-module-item__info">
            <div class="prompt-module-item__name">
              {{ mod.name }}
            </div>
            <div class="prompt-module-item__preview">
              {{ preview(mod.content) }}
            </div>
          </div>
          <div class="prompt-module-item__controls">
            <button class="prompt-module-item__btn" title="编辑" @click="openEdit(mod)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button class="prompt-module-item__btn prompt-module-item__btn--danger" title="删除" @click="confirmDelete(mod)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
            <label class="prompt-module-item__switch" :title="mod.enabled ? '点击停用' : '点击启用'">
              <input
                type="checkbox"
                :checked="mod.enabled"
                @change="toggleModule(mod)"
              />
              <span class="prompt-module-item__slider"></span>
            </label>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SaPageHero from '@/renderer/components/SaPageHero.vue'
import { promptModulesApi } from '@/renderer/api/prompt-modules-api'
import type { PromptModuleData } from '@/renderer/api/types'

const route = useRoute()
const router = useRouter()

const profile = computed(() => route.params.profile as string)

const modules = ref<PromptModuleData[]>([])
const loading = ref(true)

/** 模块级去重：同一 profile 只发一次请求（default+level3 双 slot 共用同一组件） */
const loadedProfile = ref('')

async function loadModules() {
  if (profile.value === loadedProfile.value) return
  loadedProfile.value = profile.value
  loading.value = true
  try {
    modules.value = await promptModulesApi.list(profile.value)
  } catch {
    modules.value = []
  } finally {
    loading.value = false
  }
}

// immediate=true 替代 onMounted，同时监听 profile 切换
watch(profile, loadModules, { immediate: true })

function preview(content: string): string {
  if (!content) return ''
  const stripped = content.replace(/\{\{.*?\}\}/g, '').trim()
  return stripped.length > 80 ? stripped.substring(0, 80) + '…' : stripped
}

function openCreate() {
  router.push(`/workspace/agents/${profile.value}/prompt-modules/create`)
}

function openEdit(mod: PromptModuleData) {
  router.push(`/workspace/agents/${profile.value}/prompt-modules/${mod.id}/edit`)
}

async function toggleModule(mod: PromptModuleData) {
  const target = !mod.enabled
  try {
    await promptModulesApi.toggle(mod.id, profile.value, target)
    mod.enabled = target
  } catch (e) {
    // 回滚 UI
    alert((e as Error).message ?? '操作失败')
  }
}

async function confirmDelete(mod: PromptModuleData) {
  if (!confirm(`确定删除「${mod.name}」？`)) return
  try {
    await promptModulesApi.delete(mod.id, profile.value)
    await loadModules()
  } catch (e) {
    alert((e as Error).message ?? '删除失败')
  }
}

</script>

<style scoped>
.prompt-modules {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px 24px;
  max-width: 680px;
  width: 100%;
}

.prompt-modules__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.prompt-modules__title {
  font-size: 15px;
  font-weight: 600;
}
.prompt-modules__add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: none;
  border-radius: 6px;
  background: var(--tk-accent);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: opacity 0.15s;
}
.prompt-modules__add-btn:hover {
  opacity: 0.85;
}

.prompt-modules__loading,
.prompt-modules__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--tk-text-tertiary);
  font-size: 13px;
}
.prompt-modules__empty-hint {
  margin-top: 6px;
  font-size: 11px;
}

.prompt-modules__list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ── Item ── */
.prompt-module-item {
  padding: 8px 0;
}
.prompt-module-item + .prompt-module-item {
  border-top: 1px solid var(--tk-border);
}
.prompt-module-item__body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.prompt-module-item__info {
  flex: 1;
  min-width: 0;
}
.prompt-module-item__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--tk-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.prompt-module-item__preview {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}
.prompt-module-item__controls {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.prompt-module-item__btn {
  all: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 4px;
  color: var(--tk-text-tertiary);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.prompt-module-item__btn:hover {
  background: var(--tk-bg-secondary);
  color: var(--tk-accent);
}
.prompt-module-item__btn--danger:hover {
  color: var(--tk-destructive);
}

/* ── Switch ── */
.prompt-module-item__switch {
  position: relative;
  display: inline-block;
  width: 32px;
  height: 18px;
  flex-shrink: 0;
}
.prompt-module-item__switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.prompt-module-item__slider {
  position: absolute;
  inset: 0;
  background: #c7c7cc;
  border-radius: 9px;
  cursor: pointer;
  transition: 0.2s;
}
.prompt-module-item__slider::before {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  left: 2px;
  bottom: 2px;
  background: #fff;
  border-radius: 50%;
  transition: 0.2s;
}
.prompt-module-item__switch input:checked + .prompt-module-item__slider {
  background: var(--tk-success);
}
.prompt-module-item__switch input:checked + .prompt-module-item__slider::before {
  transform: translateX(14px);
}
</style>
