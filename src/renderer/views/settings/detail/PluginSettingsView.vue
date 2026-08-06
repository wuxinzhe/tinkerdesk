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
import type { ConfigSchema, PluginInfo } from '@/renderer/api/types'

const loading = ref(false)
const plugins = ref<PluginInfo[]>([])

/** 配置弹层状态 */
const configOpen = ref(false)
const configPlugin = ref<PluginInfo | null>(null)
const configSchema = ref<ConfigSchema | null>(null)
const configInitial = ref<Record<string, unknown>>({})

async function loadPlugins(): Promise<void> {
  loading.value = true
  try {
    plugins.value = await pluginsApi.list()
  } finally {
    loading.value = false
  }
}

async function togglePlugin(p: PluginInfo): Promise<void> {
  const enabled = !p.status.enabled
  try {
    const result = await pluginsApi.toggle(p.manifest.id, enabled)
    p.status.enabled = result
  } catch {
    // 错误提示由 inv 拦截统一派发
  }
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

// 插件事件（stt:on-text 等）——v1 仅打日志，消费由具体功能页面注册
let offEvent: (() => void) | null = null
onMounted(() => {
  loadPlugins()
  offEvent = onPluginEvent(({ pluginId, event, data }) => {
    console.log(`[plugin:event] ${pluginId}:${event}`, data ?? '')
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
</style>
