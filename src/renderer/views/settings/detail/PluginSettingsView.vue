<script setup lang="ts">
/**
 * PluginSettingsView.vue — 插件设置页（系统设置 → 插件设置）
 *
 * 插件不进应用包：用户自行下载解压到 %APPDATA%/tinkerdesk/plugins/<id>/
 * 列表来自 main PluginManager 扫描；配置表单由插件 ConfigSchema 动态渲染。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { pluginsApi, onPluginEvent } from '@/renderer/api/plugins-api'
import PluginConfigForm from '@/renderer/components/settings/PluginConfigForm.vue'
import type { ConfigSchema, PluginCheckItem, PluginInfo } from '@/renderer/api/types'

const loading = ref(false)
const plugins = ref<PluginInfo[]>([])

/** 配置弹层状态 */
const configOpen = ref(false)
const configPlugin = ref<PluginInfo | null>(null)
const configSchema = ref<ConfigSchema | null>(null)
const configInitial = ref<Record<string, unknown>>({})

/** 模型状态：pluginId → kind → ready */
const modelsStatus = ref<Record<string, Record<string, boolean>>>({})
/** 下载进度：pluginId → kind → {phase, percent} */
const modelProgress = ref<Record<string, Record<string, { phase: string; percent: number }>>>({})

async function loadPlugins(): Promise<void> {
  loading.value = true
  try {
    plugins.value = await pluginsApi.list()
    // 有 modelDeps 的插件：查询模型就绪状态
    for (const p of plugins.value) {
      if (p.manifest.modelDeps?.length) {
        await refreshModelsStatus(p.manifest.id)
      }
    }
  } finally {
    loading.value = false
  }
}

/** 查询插件模型就绪状态（models:status；未实现该能力的插件静默跳过） */
async function refreshModelsStatus(pluginId: string): Promise<void> {
  try {
    const status = await pluginsApi.invokePlugin<Record<string, boolean>>(pluginId, 'models:status')
    modelsStatus.value = { ...modelsStatus.value, [pluginId]: status }
  } catch {
    // 插件未实现 models:status：视为无模型管理
  }
}

/** 下载该插件全部缺失模型（进度经 models:progress 事件更新） */
async function downloadModels(p: PluginInfo): Promise<void> {
  try {
    await pluginsApi.invokePlugin(p.manifest.id, 'models:download')
    await refreshModelsStatus(p.manifest.id)
  } catch {
    // 错误提示由 inv 拦截统一派发
  }
}

async function togglePlugin(p: PluginInfo): Promise<void> {
  const enabled = !p.status.enabled
  try {
    const result = await pluginsApi.toggle(p.manifest.id, enabled)
    if (result.ok) {
      p.status.enabled = result.enabled
    } else if (result.checks?.length) {
      // 启用被自检拦截：弹出引导修复（下载模型 / 打开配置）
      showCheckGuide(p, result.checks)
    }
  } catch {
    // 错误提示由 inv 拦截统一派发
  }
}

/** 自检引导弹层状态 */
const guideOpen = ref(false)
const guidePlugin = ref<PluginInfo | null>(null)
const guideChecks = ref<PluginCheckItem[]>([])

function showCheckGuide(p: PluginInfo, checks: PluginCheckItem[]): void {
  guidePlugin.value = p
  guideChecks.value = checks
  guideOpen.value = true
}

function closeGuide(): void {
  guideOpen.value = false
  guidePlugin.value = null
  guideChecks.value = []
}

/** 自检引导动作：下载缺失模型 */
async function guideDownloadModels(): Promise<void> {
  if (!guidePlugin.value) return
  const p = guidePlugin.value
  try {
    await pluginsApi.invokePlugin(p.manifest.id, 'models:download')
    await refreshModelsStatus(p.manifest.id)
    // 下载完成后重跑自检
    const check = await pluginsApi.check(p.manifest.id)
    if (check.ok) {
      closeGuide()
      // 直接完成启用
      const result = await pluginsApi.toggle(p.manifest.id, true)
      if (result.ok) p.status.enabled = true
    } else {
      guideChecks.value = check.checks
    }
  } catch {
    // 错误提示由 inv 拦截统一派发
  }
}

/** 自检引导动作：打开配置表单 */
function guideOpenConfig(): void {
  if (!guidePlugin.value) return
  const p = guidePlugin.value
  closeGuide()
  void openConfig(p)
}

async function openConfig(p: PluginInfo): Promise<void> {
  configPlugin.value = p
  configOpen.value = true
  configSchema.value = await pluginsApi.getSchema(p.manifest.id)
  configInitial.value = await pluginsApi.getConfig(p.manifest.id)
}

async function saveConfig(patch: Record<string, unknown>): Promise<void> {
  if (!configPlugin.value) return
  try {
    await pluginsApi.saveConfig(configPlugin.value.manifest.id, patch)
    configOpen.value = false
  } catch {
    // 错误提示由 inv 拦截统一派发
  }
}

function closeConfig(): void {
  configOpen.value = false
  configPlugin.value = null
}

// 插件事件：models:progress 更新下载进度
let offEvent: (() => void) | null = null
onMounted(() => {
  loadPlugins()
  offEvent = onPluginEvent(({ pluginId, event, data }) => {
    if (event === 'models:progress' && data && typeof data === 'object') {
      const { kind, phase, percent } = data as { kind: string; phase: string; percent: number }
      modelProgress.value = {
        ...modelProgress.value,
        [pluginId]: { ...(modelProgress.value[pluginId] ?? {}), [kind]: { phase, percent } },
      }
      // 下载完成：刷新就绪状态
      if (phase === 'done') {
        void refreshModelsStatus(pluginId)
      }
    }
  })
})
onUnmounted(() => {
  offEvent?.()
})
</script>

<template>
  <div class="plugin-settings-page">
    <div class="plugin-settings-page__header">
      <div class="plugin-settings-page__title">插件设置</div>
      <div class="plugin-settings-page__desc">
        插件独立于应用分发：下载 zip 解压到
        <code class="plugin-settings-page__path">%APPDATA%/tinkerdesk/plugins/</code>
        后重启应用即可加载。
      </div>
    </div>

    <!-- 加载态 -->
    <div v-if="loading" class="plugin-settings-page__state">加载中…</div>

    <!-- 空态 -->
    <div v-else-if="plugins.length === 0" class="plugin-settings-page__empty">
      <div class="plugin-settings-page__empty-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      </div>
      <div class="plugin-settings-page__empty-text">尚未安装插件</div>
      <div class="plugin-settings-page__empty-hint">下载插件 zip 解压到上述目录后重启应用</div>
    </div>

    <!-- 插件列表 -->
    <div v-else class="plugin-settings-page__list">
      <div v-for="p in plugins" :key="p.manifest.id" class="plugin-card">
        <div class="plugin-card__header">
          <div class="plugin-card__info">
            <div class="plugin-card__name">
              {{ p.manifest.name }}
              <span class="plugin-card__version">v{{ p.manifest.version }}</span>
            </div>
            <div class="plugin-card__desc">{{ p.manifest.description || '—' }}</div>
            <div class="plugin-card__caps">
              <span v-for="cap in p.manifest.capabilities ?? []" :key="cap" class="plugin-card__cap">
                {{ cap }}
              </span>
              <span v-if="!p.manifest.capabilities?.length" class="plugin-card__cap">无能力声明</span>
            </div>
          </div>
          <div class="plugin-card__status">
            <span :class="['plugin-card__dot', p.status.enabled ? 'on' : 'off']"></span>
            {{ p.status.enabled ? '已启用' : '已停用' }}
          </div>
        </div>

        <div v-if="p.status.detail" class="plugin-card__error">{{ p.status.detail }}</div>

        <!-- 模型管理（manifest.modelDeps 驱动：状态 + 下载 + 进度） -->
        <div v-if="p.manifest.modelDeps?.length" class="plugin-card__models">
          <div class="plugin-card__models-title">模型</div>
          <div v-for="dep in p.manifest.modelDeps" :key="dep.dest" class="model-row">
            <div class="model-row__info">
              <div class="model-row__name">{{ dep.name }}</div>
              <div class="model-row__size">{{ dep.sizeMB }}MB</div>
            </div>
            <div class="model-row__right">
              <!-- models:status 返回的 key 是 kind（dep.dest 尾部） -->
              <template v-if="modelsStatus[p.manifest.id]?.[dep.dest.split('/').pop() ?? '']">
                <span class="model-row__ready">已就绪</span>
              </template>
              <template v-else>
                <span class="model-row__ready model-row__ready--no">未就绪</span>
              </template>
              <!-- 下载进度 -->
              <div
                v-if="modelProgress[p.manifest.id]?.[dep.dest] && modelProgress[p.manifest.id]?.[dep.dest].phase !== 'done'"
                class="model-row__progress"
              >
                <div
                  class="model-row__progress-bar"
                  :style="{ width: (modelProgress[p.manifest.id]?.[dep.dest].percent ?? 0) + '%' }"
                ></div>
                <span class="model-row__progress-text">
                  {{ modelProgress[p.manifest.id]?.[dep.dest].phase === 'extract' ? '解压中…' : (modelProgress[p.manifest.id]?.[dep.dest].percent ?? 0) + '%' }}
                </span>
              </div>
            </div>
          </div>
          <button
            class="plugin-card__btn plugin-card__btn--download"
            @click="downloadModels(p)"
          >
            下载模型
          </button>
        </div>

        <div class="plugin-card__actions">
          <button class="plugin-card__btn" :disabled="!p.status.loaded" @click="togglePlugin(p)">
            {{ p.status.enabled ? '停用' : '启用' }}
          </button>
          <button class="plugin-card__btn plugin-card__btn--config" @click="openConfig(p)">
            配置
          </button>
        </div>
      </div>
    </div>

    <!-- 配置弹层 -->
    <Teleport to="body">
      <div v-if="configOpen" class="pcf-overlay" @click.self="closeConfig">
        <div class="pcf-modal">
          <div class="pcf-modal__header">
            <div class="pcf-modal__title">{{ configPlugin?.manifest.name }} — 配置</div>
            <button class="pcf-modal__close" title="关闭" @click="closeConfig">✕</button>
          </div>

          <div v-if="!configSchema" class="pcf-modal__none">该插件未声明配置项</div>
          <PluginConfigForm
            v-else
            :plugin-id="configPlugin!.manifest.id"
            :schema="configSchema"
            :initial="configInitial"
            @save="saveConfig"
          />
        </div>
      </div>
    </Teleport>

    <!-- 启用自检引导弹层（check 不通过时弹出，引导下载模型/打开配置） -->
    <Teleport to="body">
      <div v-if="guideOpen" class="guide-overlay" @click.self="closeGuide">
        <div class="guide-modal">
          <div class="guide-modal__header">
            <div class="guide-modal__title">「{{ guidePlugin?.manifest.name }}」启用前检查未通过</div>
            <button class="guide-modal__close" title="关闭" @click="closeGuide">✕</button>
          </div>
          <div class="guide-modal__list">
            <div v-for="c in guideChecks" :key="c.name" class="guide-item">
              <span class="guide-item__icon" :class="c.ok ? 'ok' : 'no'">
                {{ c.ok ? '✓' : '!' }}
              </span>
              <div class="guide-item__body">
                <div class="guide-item__name">{{ c.name }}</div>
                <div v-if="c.hint" class="guide-item__hint">{{ c.hint }}</div>
              </div>
              <button
                v-if="!c.ok && c.action === 'download-models'"
                class="guide-item__btn"
                @click="guideDownloadModels"
              >
                下载模型
              </button>
              <button
                v-if="!c.ok && c.action === 'open-config'"
                class="guide-item__btn"
                @click="guideOpenConfig"
              >
                去配置
              </button>
            </div>
          </div>
          <div class="guide-modal__footer">
            <button class="guide-modal__cancel" @click="closeGuide">取消</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.plugin-settings-page {
  display: flex;
  flex-direction: column;
  gap: var(--sa-space-5, 20px);
  padding: var(--sa-space-5, 20px) var(--sa-space-6, 24px);
  height: 100%;
  overflow-y: auto;
}

.plugin-settings-page__title {
  font-size: var(--sa-fs-title, 20px);
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
}

.plugin-settings-page__desc {
  margin-top: var(--sa-space-1, 4px);
  font-size: var(--sa-fs-body, 13px);
  line-height: 1.5;
  color: var(--sa-text-secondary, #86868b);
}

.plugin-settings-page__path {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  background: var(--sa-bg-secondary, #f5f5f7);
  border-radius: 4px;
  padding: 1px 5px;
}

.plugin-settings-page__state {
  display: flex;
  justify-content: center;
  padding: var(--sa-space-6, 24px) 0;
  color: var(--sa-text-tertiary, #aeaeb2);
  font-size: var(--sa-fs-body, 13px);
}

.plugin-settings-page__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sa-space-2, 8px);
  text-align: center;
}

.plugin-settings-page__empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-text-tertiary, #aeaeb2);
  margin-bottom: var(--sa-space-1, 4px);
}

.plugin-settings-page__empty-text {
  font-size: var(--sa-fs-body, 13px);
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
}

.plugin-settings-page__empty-hint {
  font-size: var(--sa-fs-caption, 11px);
  color: var(--sa-text-tertiary, #aeaeb2);
}

/* ── 插件卡片 ── */
.plugin-settings-page__list {
  display: flex;
  flex-direction: column;
  gap: var(--sa-space-3, 12px);
}

.plugin-card {
  padding: var(--sa-space-4, 16px);
  background: var(--sa-bg-primary, #ffffff);
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: var(--sa-radius-lg, 12px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.plugin-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sa-space-3, 12px);
}

.plugin-card__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
}

.plugin-card__version {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 400;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.plugin-card__desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--sa-text-secondary, #86868b);
}

.plugin-card__caps {
  display: flex;
  gap: 6px;
  margin-top: var(--sa-space-2, 8px);
  flex-wrap: wrap;
}

.plugin-card__cap {
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 500;
  border-radius: 999px;
  background: rgba(0, 122, 255, 0.08);
  color: var(--sa-accent, #007aff);
}

.plugin-card__status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--sa-text-secondary, #86868b);
  flex-shrink: 0;
}

.plugin-card__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.plugin-card__dot.on {
  background: var(--sa-success, #34c759);
}

.plugin-card__dot.off {
  background: var(--sa-text-quaternary, #c7c7cc);
}

.plugin-card__error {
  margin-top: var(--sa-space-2, 8px);
  font-size: 12px;
  color: var(--sa-destructive, #ff3b30);
}

.plugin-card__actions {
  display: flex;
  gap: var(--sa-space-2, 8px);
  margin-top: var(--sa-space-3, 12px);
}

/* ── 模型管理区 ── */

.plugin-card__models {
  margin-top: var(--sa-space-3, 12px);
  padding: var(--sa-space-3, 12px);
  background: var(--sa-bg-secondary, #f5f5f7);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: var(--sa-space-2, 8px);
}

.plugin-card__models-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--sa-text-secondary, #86868b);
}

.model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sa-space-3, 12px);
}

.model-row__info {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.model-row__name {
  font-size: 12px;
  color: var(--sa-text-primary, #1d1d1f);
}

.model-row__size {
  font-size: 11px;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.model-row__right {
  display: flex;
  align-items: center;
  gap: var(--sa-space-2, 8px);
  flex-shrink: 0;
}

.model-row__ready {
  font-size: 11px;
  color: var(--sa-success, #34c759);
}

.model-row__ready--no {
  color: var(--sa-destructive, #ff3b30);
}

.model-row__progress {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 110px;
}

.model-row__progress-bar {
  height: 4px;
  border-radius: 2px;
  background: var(--sa-accent, #007aff);
  transition: width 0.2s;
}

.model-row__progress-text {
  font-size: 11px;
  color: var(--sa-text-secondary, #86868b);
  white-space: nowrap;
}

.plugin-card__btn--download {
  align-self: flex-start;
  color: var(--sa-accent, #007aff);
  border-color: var(--sa-accent, #007aff);
  background: rgba(0, 122, 255, 0.06);
}

.plugin-card__btn--download:hover:not(:disabled) {
  background: rgba(0, 122, 255, 0.12);
}

.plugin-card__btn {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--sa-text-primary, #1d1d1f);
  background: var(--sa-bg-secondary, #f5f5f7);
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease-in-out, border-color 0.15s ease-in-out;
}

.plugin-card__btn:hover:not(:disabled) {
  background: var(--sa-bg-tertiary, #fafafa);
  border-color: var(--sa-accent, #007aff);
}

.plugin-card__btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.plugin-card__btn--config {
  background: var(--sa-bg-primary, #ffffff);
}

/* ── 配置弹层 ── */
.pcf-overlay {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
}

.pcf-modal {
  width: min(420px, calc(100vw - 48px));
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  padding: var(--sa-space-5, 20px);
  background: var(--sa-bg-primary, #ffffff);
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}

.pcf-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sa-space-4, 16px);
}

.pcf-modal__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
}

.pcf-modal__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--sa-text-tertiary, #aeaeb2);
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.15s;
}

.pcf-modal__close:hover {
  background: var(--sa-bg-secondary, #f5f5f7);
}

.pcf-modal__none {
  font-size: 13px;
  color: var(--sa-text-tertiary, #aeaeb2);
  text-align: center;
  padding: var(--sa-space-5, 20px) 0;
}

/* ── 启用自检引导弹层 ── */

.guide-overlay {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
}

.guide-modal {
  width: min(440px, calc(100vw - 48px));
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  padding: var(--sa-space-5, 20px);
  background: var(--sa-bg-primary, #ffffff);
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}

.guide-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sa-space-4, 16px);
}

.guide-modal__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
}

.guide-modal__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--sa-text-tertiary, #aeaeb2);
  cursor: pointer;
  font-size: 12px;
}

.guide-modal__close:hover {
  background: var(--sa-bg-secondary, #f5f5f7);
}

.guide-modal__list {
  display: flex;
  flex-direction: column;
  gap: var(--sa-space-2, 8px);
}

.guide-item {
  display: flex;
  align-items: center;
  gap: var(--sa-space-3, 12px);
  padding: var(--sa-space-3, 12px);
  background: var(--sa-bg-secondary, #f5f5f7);
  border-radius: 10px;
}

.guide-item__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
}

.guide-item__icon.ok {
  color: var(--sa-success, #34c759);
  background: rgba(52, 199, 89, 0.12);
}

.guide-item__icon.no {
  color: var(--sa-destructive, #ff3b30);
  background: rgba(255, 59, 48, 0.12);
}

.guide-item__body {
  flex: 1;
  min-width: 0;
}

.guide-item__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--sa-text-primary, #1d1d1f);
}

.guide-item__hint {
  margin-top: 2px;
  font-size: 12px;
  color: var(--sa-text-secondary, #86868b);
}

.guide-item__btn {
  flex-shrink: 0;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--sa-accent, #007aff);
  background: rgba(0, 122, 255, 0.06);
  border: 1px solid var(--sa-accent, #007aff);
  border-radius: 8px;
  cursor: pointer;
}

.guide-item__btn:hover {
  background: rgba(0, 122, 255, 0.12);
}

.guide-modal__footer {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--sa-space-4, 16px);
}

.guide-modal__cancel {
  padding: 6px 14px;
  font-size: 12px;
  font-family: inherit;
  color: var(--sa-text-secondary, #86868b);
  background: var(--sa-bg-primary, #ffffff);
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 8px;
  cursor: pointer;
}

.guide-modal__cancel:hover {
  border-color: var(--sa-text-secondary, #86868b);
}
</style>
