<script setup lang="ts">
/**
 * PluginSettingsView.vue — 插件设置页（系统设置 → 插件设置）
 *
 * 职责：插件列表 + 启用/停用注册。插件自身的一切操作（自检/模型下载/配置表单）
 * 都在独立 Lv3 配置页（/workspace/settings/plugins/:pluginId）完成。
 * 启用前自检失败 → 跳转配置页引导修复。
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { pluginsApi } from '@/renderer/api/plugins-api'
import type { PluginInfo } from '@/renderer/api/types'

const router = useRouter()
const loading = ref(false)
const plugins = ref<PluginInfo[]>([])

async function loadPlugins(): Promise<void> {
  loading.value = true
  try {
    plugins.value = await pluginsApi.list()
  } finally {
    loading.value = false
  }
}

/** 启用/停用（注册/注销）：启用前自检由 toggle 拦截，失败跳配置页引导 */
async function togglePlugin(p: PluginInfo): Promise<void> {
  const enabled = !p.status.enabled
  try {
    const result = await pluginsApi.toggle(p.manifest.id, enabled)
    if (result.ok) {
      p.status.enabled = result.enabled
    } else if (result.checks?.length) {
      // 自检未通过：去配置页完成配置（下载模型/填参数）
      void router.push(`/workspace/settings/plugins/${p.manifest.id}`)
    }
  } catch {
    // 错误提示由 inv 拦截统一派发
  }
}

/** 进入插件配置页（Lv3） */
function openConfig(p: PluginInfo): void {
  void router.push(`/workspace/settings/plugins/${p.manifest.id}`)
}

onMounted(loadPlugins)
</script>

<template>
  <div class="plugin-settings-page">
    <div class="plugin-settings-page__header">
      <div class="plugin-settings-page__title">插件设置</div>
      <div class="plugin-settings-page__desc">
        插件独立于应用分发：下载 zip 解压到
        <code class="plugin-settings-page__path">%APPDATA%/tinkerdesk/plugins/</code>
        后重启应用即可加载。启用后按插件声明的接口注册为 provider。
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
            {{ p.status.enabled ? (p.status.started ? '已注册' : '未就绪') : '已停用' }}
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
  font-size: 13px;
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
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.plugin-settings-page__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sa-space-2, 8px);
  text-align: center;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.plugin-settings-page__empty-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
}

.plugin-settings-page__empty-hint {
  font-size: 11px;
}

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
  line-height: 1.5;
}

.plugin-card__caps {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.plugin-card__cap {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 999px;
  color: var(--sa-accent, #007aff);
  background: rgba(0, 122, 255, 0.08);
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
  background: var(--sa-text-tertiary, #aeaeb2);
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
  background: var(--sa-bg-primary, #ffffff);
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}

.plugin-card__btn:hover:not(:disabled) {
  border-color: var(--sa-accent, #007aff);
}

.plugin-card__btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.plugin-card__btn--config {
  color: var(--sa-accent, #007aff);
  border-color: var(--sa-accent, #007aff);
  background: rgba(0, 122, 255, 0.06);
}

.plugin-card__btn--config:hover:not(:disabled) {
  background: rgba(0, 122, 255, 0.12);
}
</style>
