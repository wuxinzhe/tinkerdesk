<template>
  <!-- 设置详情内容分发器（不套 L3——每个子页面自己套 L3PageLayout——
       统一规范：所有 L3 级页面自套——无父级外壳模式） -->
  <div class="settings-detail">
      <!-- 模型设置 -->
      <CustomModelSettingsView v-if="section === 'model'" />

      <!-- MCP 工具设置 -->
      <McpSettingsView v-else-if="section === 'mcp'" />

      <!-- 扩展设置 -->
      <ProviderSettingsView v-else-if="section === 'providers'" />

      <!-- 语音设置 -->

      <!-- 通用设置（快捷键等） -->
      <GeneralSettingsView v-else-if="section === 'general'" />

      <!-- 占位 -->
      <div v-else class="settings-placeholder">
        <div class="settings-placeholder__inner">
          <div class="settings-placeholder__icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </div>
          <p class="settings-placeholder__text">
            选择一个设置项
          </p>
        </div>
      </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import CustomModelSettingsView from '@/renderer/views/settings/detail/CustomModelSettingsView.vue'
import McpSettingsView from '@/renderer/views/settings/detail/McpSettingsView.vue'
import ProviderSettingsView from '@/renderer/views/settings/detail/ProviderSettingsView.vue'
import GeneralSettingsView from '@/renderer/views/settings/detail/GeneralSettingsView.vue'

const route = useRoute()

const section = computed(() => route.params.section as string || '')

</script>

<style scoped>
/* 设置详情容器：L3 全宽滚动（滚动条在窗口最右）——
   宽度限制下沉到 body 内容（680 靠左——滚动条不跟窄列走） */
.settings-detail {
  /* 无 max-width——L3PageLayout 恢复全宽 flex:1 滚动 */
}
.settings-detail__body {
  max-width: 680px;
  width: 100%;
}
.settings-page {
  padding: 24px;
  width: 100%;
}
.settings-page__placeholder {
  font-size: 13px;
  color: var(--tk-text-tertiary);
  text-align: center;
  margin-top: 40px;
}

.settings-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.settings-placeholder__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--tk-text-tertiary);
}
.settings-placeholder__icon-wrap {
  opacity: 0.4;
}
.settings-placeholder__text {
  font-size: 13px;
  margin: 0;
}
</style>
