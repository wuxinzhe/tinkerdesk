<script setup lang="ts">
/**
 * PluginSettingsView.vue — 插件设置页（系统设置 → 插件设置）
 * 插件系统规划中：当前为占位页，后续接入插件注册/启停/配置。
 */
</script>

<template>
  <div class="plugin-settings-page">
    <div class="plugin-settings-page__header">
      <div class="plugin-settings-page__title">插件设置</div>
      <div class="plugin-settings-page__desc">管理客户端插件：启用、停用和配置第三方扩展能力。</div>
    </div>

    <div class="plugin-settings-page__body">
      <div class="plugin-settings-page__empty">
        <div class="plugin-settings-page__empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </div>
        <div class="plugin-settings-page__empty-text">插件功能即将推出</div>
        <div class="plugin-settings-page__empty-hint">后续将支持安装、启用和配置客户端插件</div>
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
  font-size: var(--sa-fs-body, 13px);
  line-height: 1.5;
  color: var(--sa-text-secondary, #86868b);
}

.plugin-settings-page__body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.plugin-settings-page__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sa-space-2, 8px);
  text-align: center;
  color: var(--sa-text-tertiary, #aeaeb2);
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
</style>
