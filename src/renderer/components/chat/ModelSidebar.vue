<script setup lang="ts">
/**
 * ModelSidebar.vue — 侧边栏模型列表（原模型设置页功能移植——与工作区解耦）
 *
 * Emil 设计哲学：不对称时序（enter 200ms / leave 120ms）——
 * grid-template-rows 高度展开（空间真实生长）——
 * prefers-reduced-motion 门控——hover 触屏门控——focus-visible 可达性。
 * 数据/操作走 modelsApi（listSceneModels/listCustomModels/bindSceneModel/unbindSceneModel）。
 */
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { modelsApi } from '@/renderer/api/models-api'
import type { SceneModelDetail, SceneBindingVO } from '@/renderer/api/types'

const route = useRoute()
const profile = computed(() => (route.params.profile as string) || 'default')

/** 绑定项（主/备标记——isMain 由 priority===0 推断） */
interface SidebarBinding {
  modelId: string
  modelAlias: string
  modelName: string
  isMain: boolean
}

interface SidebarScene {
  sceneId: string
  sceneName: string
  bindings: SidebarBinding[]
}

const scenes = ref<SidebarScene[]>([])
const scenesLoading = ref(false)
const expandedScenes = ref(new Set<string>())
const modelOptions = ref<Array<{ id: string; alias: string; modelName: string }>>([])
const addFallbackModel = reactive<Record<string, string | null>>({})
const addingFallback = ref(new Set<string>())
const removingBindings = ref(new Set<string>())

/** SceneModelDetail → SidebarScene（isMain = priority 0） */
function toSidebarScene(d: SceneModelDetail): SidebarScene {
  return {
    sceneId: d.sceneId,
    sceneName: d.sceneName,
    bindings: (d.bindings ?? []).map((b: SceneBindingVO) => ({
      modelId: b.modelId,
      modelAlias: b.modelAlias,
      modelName: b.modelName,
      isMain: b.priority === 0,
    })),
  }
}

function toggleScene(sceneId: string): void {
  const next = new Set(expandedScenes.value)
  if (next.has(sceneId)) next.delete(sceneId)
  else next.add(sceneId)
  expandedScenes.value = next
}

function sceneSummary(s: SidebarScene): string {
  if (s.bindings.length === 0) return '未配置'
  const main = s.bindings.find((b) => b.isMain)
  return main ? main.modelAlias : `${s.bindings.length} 个模型`
}

function availableModels(s: SidebarScene): Array<{ id: string; alias: string; modelName: string }> {
  const bound = new Set(s.bindings.map((b) => b.modelId))
  return modelOptions.value.filter((m) => !bound.has(m.id))
}

async function addFallback(sceneId: string): Promise<void> {
  const mid = addFallbackModel[sceneId]
  if (!mid) return
  addingFallback.value = new Set(addingFallback.value).add(sceneId)
  try {
    await modelsApi.bindSceneModel(profile.value, { sceneId, modelId: mid })
    addFallbackModel[sceneId] = null
    await loadScenes()
  } catch {
    // 保持现状
  } finally {
    const next = new Set(addingFallback.value)
    next.delete(sceneId)
    addingFallback.value = next
  }
}

async function removeBinding(sceneId: string, modelId: string): Promise<void> {
  const key = `${sceneId}:${modelId}`
  removingBindings.value = new Set(removingBindings.value).add(key)
  try {
    await modelsApi.unbindSceneModel(profile.value, sceneId, modelId)
    await loadScenes()
  } catch {
    // 保持现状
  } finally {
    const next = new Set(removingBindings.value)
    next.delete(key)
    removingBindings.value = next
  }
}

async function loadScenes(): Promise<void> {
  scenesLoading.value = true
  try {
    const res = (await modelsApi.listSceneModels(profile.value)) ?? []
    scenes.value = res.map(toSidebarScene)
  } catch {
    scenes.value = []
  } finally {
    scenesLoading.value = false
  }
}

async function loadModels(): Promise<void> {
  try {
    modelOptions.value = (await modelsApi.listCustomModels(profile.value)) ?? []
  } catch {
    modelOptions.value = []
  }
}

watch(profile, () => {
  expandedScenes.value = new Set()
  Object.keys(addFallbackModel).forEach((k) => delete addFallbackModel[k])
  loadScenes()
  loadModels()
})

onMounted(() => {
  loadScenes()
  loadModels()
})
</script>

<template>
  <div class="model-sidebar">
    <div class="model-sidebar__header">
      <span class="model-sidebar__title">模型分配</span>
    </div>
    <div v-if="scenesLoading" class="model-sidebar__state">加载中…</div>
    <div v-else-if="scenes.length === 0" class="model-sidebar__state">暂无场景</div>
    <template v-else>
      <div v-for="s in scenes" :key="s.sceneId" class="model-sidebar__scene">
        <button class="model-sidebar__disc" @click="toggleScene(s.sceneId)">
          <span class="model-sidebar__disc-label">{{ s.sceneName }}</span>
          <span class="model-sidebar__disc-summary">{{ sceneSummary(s) }}</span>
          <svg class="model-sidebar__chev" :class="{ open: expandedScenes.has(s.sceneId) }" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <!-- 展开：grid-template-rows 高度动画（空间真实生长）——enter 200ms / leave 120ms -->
        <Transition name="ms-expand">
          <div v-if="expandedScenes.has(s.sceneId)" class="model-sidebar__body">
            <div class="model-sidebar__body-inner">
              <div v-if="s.bindings.length > 0" class="model-sidebar__subs">
                <div v-for="b in s.bindings" :key="b.modelId" class="model-sidebar__sub">
                  <span class="model-sidebar__tag" :class="b.isMain ? 'model-sidebar__tag--main' : 'model-sidebar__tag--alt'">
                    {{ b.isMain ? '主' : '备' }}
                  </span>
                  <span class="model-sidebar__alias">{{ b.modelAlias }}</span>
                  <span class="model-sidebar__name">{{ b.modelName }}</span>
                  <button
                    class="model-sidebar__del"
                    title="移除"
                    :disabled="removingBindings.has(`${s.sceneId}:${b.modelId}`)"
                    @click="removeBinding(s.sceneId, b.modelId)"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
              <div v-else class="model-sidebar__empty-inline">未配置模型</div>
              <div class="model-sidebar__add">
                <select v-model="addFallbackModel[s.sceneId]" class="model-sidebar__select">
                  <option :value="null" disabled>添加备用模型…</option>
                  <option v-for="m in availableModels(s)" :key="m.id" :value="m.id">
                    {{ m.alias }}（{{ m.modelName }}）
                  </option>
                </select>
                <button
                  class="model-sidebar__add-btn"
                  :disabled="!addFallbackModel[s.sceneId] || addingFallback.has(s.sceneId)"
                  @click="addFallback(s.sceneId)"
                >
                  {{ addingFallback.has(s.sceneId) ? '添加中…' : '添加' }}
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Emil：统一强 ease-out 曲线；transition 只列精确属性 */
.model-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.model-sidebar__header {
  display: flex;
  align-items: center;
  padding: 12px 16px 8px;
}

.model-sidebar__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--tk-text-secondary);
}

.model-sidebar__state {
  padding: 16px;
  font-size: 12px;
  color: var(--tk-text-tertiary);
}

.model-sidebar__scene {
  border-bottom: 1px solid var(--tk-border);
}

/* 场景头：整行可点——按下反馈 */
.model-sidebar__disc {
  display: flex;
  align-items: center;
  gap: 6px;
  width: calc(100% - 16px);
  margin: 2px 8px;
  padding: 10px 12px;
  font-size: 12px;
  font-family: inherit;
  color: var(--tk-text-primary);
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  border-radius: 10px;
  transition: background 160ms cubic-bezier(0.23, 1, 0.32, 1), color 160ms cubic-bezier(0.23, 1, 0.32, 1), transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.model-sidebar__disc:active {
  transform: scale(0.98);
}

.model-sidebar__disc:focus-visible {
  outline: 2px solid var(--tk-accent);
  outline-offset: -2px;
}

@media (hover: hover) and (pointer: fine) {
  .model-sidebar__disc:hover {
    background: var(--tk-bg-secondary);
  }
}

.model-sidebar__disc-label {
  font-weight: 500;
  flex-shrink: 0;
}

.model-sidebar__disc-summary {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--tk-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-sidebar__chev {
  color: var(--tk-text-tertiary);
  transition: transform 180ms cubic-bezier(0.23, 1, 0.32, 1);
}

.model-sidebar__chev.open {
  transform: rotate(180deg);
}

/* 展开过渡：grid 行高动画（空间真实生长）——不对称时序（enter 200 / leave 120） */
.ms-expand-enter-active,
.ms-expand-leave-active {
  transition: grid-template-rows 200ms cubic-bezier(0.23, 1, 0.32, 1), opacity 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.ms-expand-leave-active {
  transition-duration: 120ms;
}

.ms-expand-enter-from,
.ms-expand-leave-to {
  opacity: 0;
}

/* grid 展开容器：外网格 0fr→1fr——内层 overflow hidden 防文字溢出 */
.model-sidebar__body {
  display: grid;
  grid-template-rows: 1fr;
}

.ms-expand-enter-from .model-sidebar__body,
.ms-expand-leave-to .model-sidebar__body {
  grid-template-rows: 0fr;
}

.model-sidebar__body-inner {
  min-height: 0;
  overflow: hidden;
  padding: 2px 12px 10px;
}

.model-sidebar__sub {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
}

/* 主 = 实心（语义强）；备 = 边框式（低调区分） */
.model-sidebar__tag {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  flex-shrink: 0;
}

.model-sidebar__tag--main {
  color: #fff;
  background: var(--tk-accent);
}

.model-sidebar__tag--alt {
  color: var(--tk-text-secondary);
  background: transparent;
  border: 1px solid var(--tk-border);
}

.model-sidebar__alias {
  font-size: 12px;
  color: var(--tk-text-primary);
  flex-shrink: 0;
}

.model-sidebar__name {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--tk-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 删除：渐进变色（先灰后红——不闪变） */
.model-sidebar__del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--tk-text-tertiary);
  cursor: pointer;
  transition: color 160ms cubic-bezier(0.23, 1, 0.32, 1), background 160ms cubic-bezier(0.23, 1, 0.32, 1), transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.model-sidebar__del:active {
  transform: scale(0.94);
}

.model-sidebar__del:focus-visible {
  outline: 2px solid var(--tk-danger, #ff3b30);
  outline-offset: -2px;
}

@media (hover: hover) and (pointer: fine) {
  .model-sidebar__del:hover {
    color: var(--tk-danger, #ff3b30);
    background: rgba(255, 59, 48, 0.08);
  }
}

.model-sidebar__del:disabled {
  opacity: 0.4;
  cursor: default;
  transform: none;
}

.model-sidebar__empty-inline {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  padding: 4px 0;
}

.model-sidebar__add {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.model-sidebar__select {
  flex: 1;
  min-width: 0;
  padding: 5px 22px 5px 8px;
  font-size: 11px;
  font-family: inherit;
  color: var(--tk-text-primary);
  background: var(--tk-bg-secondary) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 8px center;
  appearance: none;
  border: 1px solid var(--tk-border);
  border-radius: 6px;
  transition: border-color 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.model-sidebar__select:focus-visible {
  outline: none;
  border-color: var(--tk-accent);
}

.model-sidebar__add-btn {
  padding: 6px 10px;
  font-size: 11px;
  font-family: inherit;
  color: var(--tk-accent);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 160ms cubic-bezier(0.23, 1, 0.32, 1), transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.model-sidebar__add-btn:active {
  transform: scale(0.97);
}

.model-sidebar__add-btn:focus-visible {
  outline: 2px solid var(--tk-accent);
  outline-offset: -2px;
}

@media (hover: hover) and (pointer: fine) {
  .model-sidebar__add-btn:hover {
    background: rgba(0, 122, 255, 0.1);
  }
}

.model-sidebar__add-btn:disabled {
  opacity: 0.45;
  cursor: default;
  transform: none;
}

/* Emil：prefers-reduced-motion——去位移/高度动画——保留 opacity 渐变（辅助理解） */
@media (prefers-reduced-motion: reduce) {
  .model-sidebar__chev {
    transition: none;
  }
  .ms-expand-enter-active,
  .ms-expand-leave-active {
    transition: opacity 120ms ease;
  }
}
</style>