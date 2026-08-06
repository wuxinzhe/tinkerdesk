<script setup lang="ts">
/**
 * PluginConfigView.vue — 插件配置页（Lv3 独立路由 /workspace/settings/plugins/:pluginId）
 *
 * 插件自身的一切操作都在这里：自检结果、模型下载、配置表单、启停注册。
 * 插件系统只提供通用框架，具体逻辑由插件内部实现（check、models 状态/下载、schema）。
 */
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { pluginsApi, onPluginEvent } from '@/renderer/api/plugins-api'
import PluginConfigForm from '@/renderer/components/settings/PluginConfigForm.vue'
import type { ConfigSchema, PluginCheckItem, PluginInfo } from '@/renderer/api/types'

const route = useRoute()
const router = useRouter()
const pluginId = computed(() => String(route.params.pluginId ?? ''))

const plugin = ref<PluginInfo | null>(null)
const check = ref<{ ok: boolean; checks: PluginCheckItem[] } | null>(null)
const schema = ref<ConfigSchema | null>(null)
const config = ref<Record<string, unknown>>({})
const loading = ref(true)

/** 模型状态/进度 */
const modelsStatus = ref<Record<string, boolean>>({})
const modelProgress = ref<Record<string, { phase: string; percent: number }>>({})
const downloading = ref(false)

const statusText = computed(() => {
  const s = plugin.value?.status
  if (!s) return '未加载'
  if (!s.enabled) return '已停用'
  if (!s.started) return '未就绪'
  return '已注册'
})

async function load(): Promise<void> {
  loading.value = true
  try {
    const list = await pluginsApi.list()
    plugin.value = list.find((p) => p.manifest.id === pluginId.value) ?? null
    if (!plugin.value) return
    const [checkResult, schemaResult, configResult, statusResult] = await Promise.all([
      pluginsApi.check(pluginId.value).catch(() => ({ ok: false, checks: [] })),
      pluginsApi.getSchema(pluginId.value),
      pluginsApi.getConfig(pluginId.value),
      pluginsApi.getStatus(pluginId.value),
    ])
    check.value = checkResult
    schema.value = schemaResult
    config.value = configResult
    if (plugin.value) plugin.value.status = statusResult
    await refreshModelsStatus()
  } finally {
    loading.value = false
  }
}

/** 查询模型就绪状态（仅当插件声明了 modelDeps；未声明的插件不查——查会报 No handler） */
async function refreshModelsStatus(): Promise<void> {
  if (!plugin.value?.manifest.modelDeps?.length) {
    modelsStatus.value = {}
    return
  }
  try {
    const status = await pluginsApi.invokePlugin<Record<string, boolean>>(pluginId.value, 'models:status')
    modelsStatus.value = status
  } catch {
    modelsStatus.value = {}
  }
}

/** 下载缺失模型（进度经 models:progress 事件更新） */
async function downloadModels(): Promise<void> {
  if (downloading.value) return
  downloading.value = true
  try {
    await pluginsApi.invokePlugin(pluginId.value, 'models:download')
    await refreshModelsStatus()
    await rerunCheck()
  } finally {
    downloading.value = false
  }
}

/** 保存配置后重跑自检 */
async function saveConfig(patch: Record<string, unknown>): Promise<void> {
  await pluginsApi.saveConfig(pluginId.value, patch)
  config.value = await pluginsApi.getConfig(pluginId.value)
  await rerunCheck()
}

/** 启用/停用（启用前自检拦截由 toggle 处理） */
async function togglePlugin(): Promise<void> {
  if (!plugin.value) return
  const target = !plugin.value.status.enabled
  try {
    const result = await pluginsApi.toggle(pluginId.value, target)
    if (result.ok) {
      plugin.value.status.enabled = result.enabled
      if (result.enabled) {
        plugin.value.status.started = true
      }
    } else if (result.checks?.length) {
      check.value = { ok: false, checks: result.checks }
    }
  } catch {
    // 错误提示由 inv 拦截统一派发
  }
}

async function rerunCheck(): Promise<void> {
  check.value = await pluginsApi.check(pluginId.value)
  if (check.value.ok && plugin.value && plugin.value.status.enabled) {
    // 自检通过且配置为启用：尝试注册（若之前未就绪）
    const result = await pluginsApi.toggle(pluginId.value, true)
    if (result.ok) {
      plugin.value.status.enabled = true
      plugin.value.status.started = true
    }
  }
}

// models:progress 事件 → 进度
let offEvent: (() => void) | null = null
onMounted(() => {
  load()
  offEvent = onPluginEvent(({ pluginId: pid, event, data }) => {
    if (pid !== pluginId.value || event !== 'models:progress') return
    const { kind, phase, percent } = data as { kind: string; phase: string; percent: number }
    modelProgress.value = { ...modelProgress.value, [kind]: { phase, percent } }
    if (phase === 'done') void refreshModelsStatus()
  })
})
onUnmounted(() => {
  offEvent?.()
})

// 同路由 param 变化（example-plugin → speech-sherpa）时组件复用，需重新加载
watch(pluginId, () => {
  plugin.value = null
  check.value = null
  schema.value = null
  config.value = {}
  modelsStatus.value = {}
  modelProgress.value = {}
  void load()
})
</script>

<template>
  <div class="plugin-config-page">
    <!-- 加载态 -->
    <div v-if="loading" class="plugin-config-page__state">加载中…</div>

    <div v-else-if="!plugin" class="plugin-config-page__state">
      插件不存在（{{ pluginId }}），可能已被移除
    </div>

    <div v-else class="plugin-config-page__body">
      <!-- 插件信息头 -->
      <div class="plugin-config-page__header">
        <div class="plugin-config-page__info">
          <div class="plugin-config-page__name">
            {{ plugin.manifest.name }}
            <span class="plugin-config-page__version">v{{ plugin.manifest.version }}</span>
          </div>
          <div class="plugin-config-page__desc">{{ plugin.manifest.description || '—' }}</div>
          <div class="plugin-config-page__caps">
            <span v-for="cap in plugin.manifest.capabilities ?? []" :key="cap" class="plugin-config-page__cap">
              {{ cap }}
            </span>
          </div>
        </div>
        <div class="plugin-config-page__status">
          <span class="plugin-config-page__status-badge" :class="plugin.status.enabled && plugin.status.started ? 'ok' : plugin.status.enabled ? 'warn' : 'off'">
            {{ statusText }}
          </span>
          <button class="plugin-config-page__toggle" :class="{ off: plugin.status.enabled }" @click="togglePlugin">
            {{ plugin.status.enabled ? '停用' : '启用' }}
          </button>
        </div>
      </div>

      <!-- 自检结果 -->
      <section class="plugin-config-page__section">
        <div class="plugin-config-page__section-title">自检</div>
        <div v-if="!check" class="plugin-config-page__muted">未检查</div>
        <div v-else-if="check.ok" class="plugin-config-page__check-ok">
          ✓ 全部检查项通过
        </div>
        <div v-else class="plugin-config-page__check-fail">
          <div v-for="c in check.checks.filter((x) => !x.ok)" :key="c.name" class="plugin-config-page__check-item">
            <span class="plugin-config-page__check-icon">!</span>
            <div class="plugin-config-page__check-body">
              <div class="plugin-config-page__check-name">{{ c.name }}</div>
              <div v-if="c.hint" class="plugin-config-page__check-hint">{{ c.hint }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- 模型管理 -->
      <section v-if="plugin.manifest.modelDeps?.length" class="plugin-config-page__section">
        <div class="plugin-config-page__section-title">模型</div>
        <div v-for="dep in plugin.manifest.modelDeps" :key="dep.dest" class="plugin-config-page__model">
          <div class="plugin-config-page__model-info">
            <div class="plugin-config-page__model-name">{{ dep.name }}</div>
            <div class="plugin-config-page__model-size">{{ dep.sizeMB }}MB</div>
          </div>
          <div class="plugin-config-page__model-right">
            <span v-if="modelsStatus[dep.dest.split('/').pop() ?? '']" class="plugin-config-page__ready">已就绪</span>
            <span v-else class="plugin-config-page__ready plugin-config-page__ready--no">未就绪</span>
            <div v-if="modelProgress[dep.dest.split('/').pop() ?? ''] && modelProgress[dep.dest.split('/').pop() ?? '']?.phase !== 'done'" class="plugin-config-page__progress">
              <div
                class="plugin-config-page__progress-bar"
                :style="{ width: (modelProgress[dep.dest.split('/').pop() ?? '']?.percent ?? 0) + '%' }"
              ></div>
              <span class="plugin-config-page__progress-text">
                {{ modelProgress[dep.dest.split('/').pop() ?? '']?.phase === 'extract' ? '解压中…' : (modelProgress[dep.dest.split('/').pop() ?? '']?.percent ?? 0) + '%' }}
              </span>
            </div>
          </div>
        </div>
        <button class="plugin-config-page__download" :disabled="downloading" @click="downloadModels">
          {{ downloading ? '下载中…' : '下载模型' }}
        </button>
      </section>

      <!-- 配置表单（schema 驱动，页面内嵌非弹窗） -->
      <section class="plugin-config-page__section">
        <div class="plugin-config-page__section-title">配置</div>
        <div v-if="!schema" class="plugin-config-page__muted">该插件未声明配置项</div>
        <PluginConfigForm
          v-else
          :plugin-id="plugin.manifest.id"
          :schema="schema"
          :initial="config"
          @save="saveConfig"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.plugin-config-page {
  display: flex;
  flex-direction: column;
  padding: var(--sa-space-5, 20px) var(--sa-space-6, 24px);
  height: 100%;
  overflow-y: auto;
}

.plugin-config-page__state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.plugin-config-page__body {
  display: flex;
  flex-direction: column;
  gap: var(--sa-space-5, 20px);
  max-width: 640px;
}

.plugin-config-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sa-space-4, 16px);
}

.plugin-config-page__name {
  font-size: var(--sa-fs-title, 20px);
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
}

.plugin-config-page__version {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.plugin-config-page__desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--sa-text-secondary, #86868b);
  line-height: 1.5;
}

.plugin-config-page__caps {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.plugin-config-page__cap {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 999px;
  color: var(--sa-accent, #007aff);
  background: rgba(0, 122, 255, 0.08);
}

.plugin-config-page__status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.plugin-config-page__status-badge {
  padding: 3px 10px;
  font-size: 11px;
  border-radius: 999px;
  font-weight: 500;
}

.plugin-config-page__status-badge.ok {
  color: var(--sa-success, #34c759);
  background: rgba(52, 199, 89, 0.1);
}

.plugin-config-page__status-badge.warn {
  color: var(--sa-warning, #ff9f0a);
  background: rgba(255, 159, 10, 0.1);
}

.plugin-config-page__status-badge.off {
  color: var(--sa-text-tertiary, #aeaeb2);
  background: var(--sa-bg-secondary, #f5f5f7);
}

.plugin-config-page__toggle {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--sa-accent, #007aff);
  background: rgba(0, 122, 255, 0.06);
  border: 1px solid var(--sa-accent, #007aff);
  border-radius: 8px;
  cursor: pointer;
}

.plugin-config-page__toggle:hover {
  background: rgba(0, 122, 255, 0.12);
}

.plugin-config-page__toggle.off {
  color: var(--sa-text-secondary, #86868b);
  background: var(--sa-bg-primary, #ffffff);
  border-color: var(--sa-border, #d2d2d7);
}

.plugin-config-page__toggle.off:hover {
  border-color: var(--sa-text-secondary, #86868b);
}

.plugin-config-page__section {
  padding: var(--sa-space-4, 16px);
  background: var(--sa-bg-primary, #ffffff);
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: var(--sa-radius-lg, 12px);
}

.plugin-config-page__section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
  margin-bottom: var(--sa-space-3, 12px);
}

.plugin-config-page__muted {
  font-size: 12px;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.plugin-config-page__check-ok {
  font-size: 13px;
  color: var(--sa-success, #34c759);
}

.plugin-config-page__check-fail {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plugin-config-page__check-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(255, 59, 48, 0.06);
  border-radius: 10px;
}

.plugin-config-page__check-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
  color: var(--sa-destructive, #ff3b30);
  background: rgba(255, 59, 48, 0.12);
}

.plugin-config-page__check-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--sa-text-primary, #1d1d1f);
}

.plugin-config-page__check-hint {
  margin-top: 2px;
  font-size: 12px;
  color: var(--sa-text-secondary, #86868b);
}

.plugin-config-page__model {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: var(--sa-bg-secondary, #f5f5f7);
  border-radius: 10px;
  margin-bottom: 8px;
}

.plugin-config-page__model-name {
  font-size: 13px;
  color: var(--sa-text-primary, #1d1d1f);
}

.plugin-config-page__model-size {
  margin-top: 2px;
  font-size: 11px;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.plugin-config-page__model-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.plugin-config-page__ready {
  font-size: 11px;
  color: var(--sa-success, #34c759);
}

.plugin-config-page__ready--no {
  color: var(--sa-destructive, #ff3b30);
}

.plugin-config-page__progress {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 110px;
}

.plugin-config-page__progress-bar {
  height: 4px;
  border-radius: 2px;
  background: var(--sa-accent, #007aff);
  transition: width 0.2s;
}

.plugin-config-page__progress-text {
  font-size: 11px;
  color: var(--sa-text-secondary, #86868b);
  white-space: nowrap;
}

.plugin-config-page__download {
  margin-top: 4px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--sa-accent, #007aff);
  background: rgba(0, 122, 255, 0.06);
  border: 1px solid var(--sa-accent, #007aff);
  border-radius: 8px;
  cursor: pointer;
}

.plugin-config-page__download:hover:not(:disabled) {
  background: rgba(0, 122, 255, 0.12);
}

.plugin-config-page__download:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
