<template>
  <L3PageLayout class="ms-page">
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><rect x=&quot;4&quot; y=&quot;4&quot; width=&quot;16&quot; height=&quot;16&quot; rx=&quot;2&quot;/><rect x=&quot;8&quot; y=&quot;8&quot; width=&quot;8&quot; height=&quot;8&quot; rx=&quot;1&quot;/></svg>"
      gradient="linear-gradient(135deg, #bf7af6 0%, #af52de 100%)"
      title="模型配置"
      desc="为场景绑定该 Agent 使用的模型"
    />
    <SaSection title="场景分配">
      <SaLoading v-if="scenesLoading" text="加载中…" size="small" />

      <template v-else>
        <template v-for="(s, si) in scenes" :key="s.sceneId">
          <!-- Disclosure header -->
          <button
            :class="[
              'ms-disc',
              { 'ms-disc--exp': expandedScenes.has(s.sceneId),
                'ms-disc--last': si === scenes.length - 1 && !expandedScenes.has(s.sceneId) }
            ]"
            @click="toggleScene(s.sceneId)"
          >
            <span class="ms-disc__label">{{ s.sceneName }}</span>
            <span class="ms-disc__summary">{{ sceneSummary(s) }}</span>
            <svg class="ms-disc__chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" :class="{ open: expandedScenes.has(s.sceneId) }">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          <!-- Expanded body -->
          <div v-if="expandedScenes.has(s.sceneId)" class="ms-disc-body">
            <div v-if="s.bindings.length > 0" class="ms-subs">
              <div
                v-for="(b, bi) in s.bindings"
                :key="b.modelId"
                :class="['ms-sub', { 'ms-sub--last': bi === s.bindings.length - 1 }]"
              >
                <span class="ms-sub__tag" :class="b.isMain ? 'ms-sub__tag--main' : 'ms-sub__tag--alt'">
                  {{ b.isMain ? '主' : '备' }}
                </span>
                <span class="ms-sub__alias">{{ b.modelAlias }}</span>
                <span class="ms-sub__name">{{ b.modelName }}</span>
                <button
                  class="ms-sub__del"
                  title="移除"
                  :disabled="removingBindings.has(`${s.sceneId}:${b.modelId}`)"
                  @click="removeBinding(s.sceneId, b.modelId)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            <div v-else class="ms-empty-inline">
              未配置模型
            </div>

            <div class="ms-fallback">
              <div class="ms-fallback__wrap">
                <select v-model="addFallbackModel[s.sceneId]" class="ms-select">
                  <option :value="null" disabled>
                    添加备用模型…
                  </option>
                  <option v-for="m in availableModels(s)" :key="m.id" :value="m.id">
                    {{ m.alias }}（{{ m.modelName }}）
                  </option>
                </select>
              </div>
              <SaActionBtn
                variant="primary"
                text="添加"
                :loading="!!addingFallback[s.sceneId]"
                loading-text="添加中…"
                :disabled="!addFallbackModel[s.sceneId]"
                @click="addFallback(s.sceneId)"
              />
            </div>
          </div>
        </template>
      </template>
    </SaSection>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import type { CustomModelInfo, SceneModelDetail } from '@/renderer/api/types'
import { SaSection, SaLoading, SaActionBtn, L3PageLayout, SaPageHero } from '@/renderer/components'
import { modelsApi } from '@/renderer/api/models-api'

const route = useRoute()
const profile = computed(() => route.params.profile as string)

// ── Models (for dropdown) ──
const models = ref<CustomModelInfo[]>([])

async function loadModels() {
  try {
    const res = await modelsApi.listCustomModels(profile.value)
    models.value = res ?? []
  } catch {
    models.value = []
  }
}

// ── Scenes ──
const scenes = ref<SceneModelDetail[]>([])
const scenesLoading = ref(false)
const expandedScenes = reactive(new Set<string>())
const addFallbackModel = reactive<Record<string, string | null>>({})
const addingFallback = reactive<Record<string, boolean>>({})
const removingBindings = reactive(new Set<string>())

function toggleScene(id: string) {
  if (expandedScenes.has(id)) expandedScenes.delete(id)
  else expandedScenes.add(id)
}

function sceneSummary(s: SceneModelDetail): string {
  if (s.bindings.length === 0) return '不使用'
  const p = s.bindings.find(b => b.isMain)
  return (p ?? s.bindings[0]).modelAlias
}

function availableModels(s: SceneModelDetail): CustomModelInfo[] {
  const bound = new Set(s.bindings.map(b => b.modelId))
  return models.value.filter(m => !bound.has(m.id))
}

async function addFallback(sceneId: string) {
  const mid = addFallbackModel[sceneId]
  if (!mid) return
  addingFallback[sceneId] = true
  try {
    await modelsApi.bindSceneModel(profile.value, { sceneId, modelId: mid })
    await loadScenes()
    addFallbackModel[sceneId] = null
  } catch { /* ignore */
  } finally { addingFallback[sceneId] = false }
}

async function removeBinding(sceneId: string, modelId: string) {
  const key = `${sceneId}:${modelId}`
  removingBindings.add(key)
  try {
    await modelsApi.unbindSceneModel(profile.value, sceneId, modelId)
    await loadScenes()
  } catch { /* ignore */
  } finally { removingBindings.delete(key) }
}

async function loadScenes() {
  scenesLoading.value = true
  try {
    const res = await modelsApi.listSceneModels(profile.value)
    scenes.value = res ?? []
    for (const s of res ?? []) {
      if (!(s.sceneId in addFallbackModel)) addFallbackModel[s.sceneId] = null
    }
  } catch { scenes.value = []
  } finally { scenesLoading.value = false }
}

onMounted(async () => {
  await Promise.all([loadModels(), loadScenes()])
})

// 切换 profile 时重新加载
watch(profile, async () => {
  expandedScenes.clear()
  Object.keys(addFallbackModel).forEach(k => delete addFallbackModel[k])
  await Promise.all([loadModels(), loadScenes()])
})
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════
   macOS Settings 风格 — 场景分配
   ═══════════════════════════════════════════════════════ */

/* 窄列布局（与系统设置 L3 对齐：680px 宽，靠左） */
.ms-page {
  width: 100%;
}

/* ── Disclosure header ── */

.ms-disc {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  border: none;
  border-bottom: 1px solid var(--tk-border-light);
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  color: var(--tk-text-primary);
  transition: background-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
  -webkit-appearance: none;
}
.ms-disc:active {
  transform: scale(0.99);
}
@media (hover: hover) and (pointer: fine) {
  .ms-disc:hover {
    background: var(--tk-bg-secondary);
  }
}

.ms-disc--exp {
  border-bottom: none;
}

.ms-disc--last {
  border-bottom: none;
}

.ms-disc__label {
  font-weight: 600;
  flex-shrink: 0;
}

.ms-disc__summary {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ms-disc__chev {
  flex-shrink: 0;
  color: var(--tk-text-tertiary);
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.ms-disc__chev.open {
  transform: rotate(180deg);
}

/* ── Expanded body ── */

.ms-disc-body {
  border-top: 1px solid var(--tk-border-light);
  border-bottom: 1px solid var(--tk-border-light);
}

.ms-subs {
  display: flex;
  flex-direction: column;
}

.ms-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px 8px 28px;
  border-bottom: 1px solid var(--tk-border-light);
}

.ms-sub--last {
  border-bottom: none;
}

.ms-sub__tag {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
  line-height: 1.5;
  flex-shrink: 0;
}

.ms-sub__tag--main {
  background: var(--tk-accent);
  color: #fff;
}

.ms-sub__tag--alt {
  background: var(--tk-bg-secondary);
  color: var(--tk-text-tertiary);
}

.ms-sub__alias {
  font-size: 13px;
  font-weight: 500;
  color: var(--tk-text-primary);
}

.ms-sub__name {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ms-sub__del {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--tk-text-tertiary);
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.12s, color 0.12s;
}

.ms-sub__del:hover {
  opacity: 1;
  color: var(--tk-destructive);
}

.ms-sub__del:disabled {
  opacity: 0.2;
  cursor: not-allowed;
}

/* ── Inline empty ── */

.ms-empty-inline {
  padding: 12px 14px 12px 28px;
  font-size: 13px;
  color: var(--tk-text-tertiary);
}

/* ── Fallback add row ── */

.ms-fallback {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 14px 8px 28px;
  border-top: 1px solid var(--tk-border-light);
}

.ms-fallback__wrap {
  flex: 1;
  min-width: 0;
}

.ms-fallback__wrap .ms-select {
  height: 28px;
  font-size: 12px;
}

/* ── Select ── */

.ms-select {
  width: 100%;
  height: 32px;
  padding: 0 28px 0 10px;
  border: 1px solid var(--tk-border-light);
  border-radius: 6px;
  background: var(--tk-bg-secondary);
  font-size: 13px;
  font-family: inherit;
  color: var(--tk-text-primary);
  outline: none;
  appearance: none;
  cursor: pointer;
}

.ms-select:focus {
  border-color: var(--tk-accent);
  box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.12);
}
</style>
