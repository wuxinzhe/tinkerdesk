<template>
  <L3PageLayout class="tool-provider-settings">
    <!-- 页头 -->
    <SaPageHero
      icon='<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>'
      gradient="linear-gradient(135deg, #4d9fff 0%, var(--tk-accent) 100%)"
      :title="toolLabel + ' Provider'"
      desc="选择该工具的 provider——内置为工具自带实现，插件可接入自己的服务"
    />
    <div v-if="loading" class="tps-loading">加载中…</div>
    <div v-else class="tps-body">
      <!-- 工具信息 -->
      <div class="tps-tool-info">
        <div class="tps-tool-name">{{ toolLabel }}</div>
        <div class="tps-tool-desc">选择该工具的 provider——内置为工具自带实现（默认），插件可接入自己的服务。</div>
      </div>

      <!-- Provider 列表 -->
      <div class="tps-section">
        <div class="tps-section-title">Provider</div>
        <div class="tps-provider-list">
          <!-- 内置 -->
          <label v-if="builtin" class="tps-provider-row" :class="{ active: activeId === builtin.id }">
            <input
              type="radio"
              name="provider"
              :checked="activeId === builtin.id"
              @change="selectProvider(builtin.id)"
            />
            <div class="tps-provider-info">
              <div class="tps-provider-name">{{ builtin.name }}</div>
              <div class="tps-provider-desc">{{ builtin.description || '工具自带的实现（无需配置，开箱即用）' }}</div>
            </div>
          </label>

          <!-- 插件 provider（内置插件 pluginId 以 builtin- 开头——显示「内置」标记） -->
          <label
            v-for="p in providers"
            :key="p.pluginId"
            class="tps-provider-row"
            :class="{ active: activeId === p.pluginId }"
          >
            <input
              type="radio"
              name="provider"
              :checked="activeId === p.pluginId"
              @change="selectProvider(p.pluginId)"
            />
            <div class="tps-provider-info">
              <div class="tps-provider-name">
                {{ p.name }}
                <span v-if="p.pluginId.startsWith('builtin-')" class="tps-provider-builtin">内置</span>
              </div>
              <div class="tps-provider-desc">
                {{ p.pluginId }} · v{{ p.version }}{{ p.pluginId.startsWith('builtin-') ? '（内置实现）' : '（插件）' }}
              </div>
            </div>
          </label>

          <div v-if="providers.length === 0" class="tps-provider-empty">
            {{ builtin ? '暂无插件 provider——安装支持该工具的插件后可在此选择。' : '暂无可用 provider——安装支持该工具的插件（如 speech-sherpa）后可在此选择。' }}
          </div>
        </div>
      </div>

      <!-- 回退开关 -->
      <div v-if="allowFallbackToggle" class="tps-section">
        <label class="tps-fallback-row">
          <div class="tps-fallback-info">
            <div class="tps-fallback-name">失败回退内置</div>
            <div class="tps-fallback-desc">插件 provider 调用失败时自动使用内置实现，避免工具不可用</div>
          </div>
          <span class="tps-switch">
            <input type="checkbox" :checked="fallback" :disabled="saving" @change="toggleFallback" />
            <span class="tps-switch-track"></span>
          </span>
        </label>
      </div>

      <div v-if="saving" class="tps-saving">保存中…</div>
    </div>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { L3PageLayout, SaPageHero } from '@/renderer/components'
import { webProviderApi, type WebProviderInfo } from '@/renderer/api/web-provider-api'
import { audioToolProviderApi, type AudioToolProviderInfo } from '@/renderer/api/audio-tool-provider-api'

const route = useRoute()

const toolName = computed(() => (route.params.toolName as string) ?? '')

/** 接口类型：web.search / web.extract / tool.tts / tool.stt */
const iface = computed(() => {
  const n = toolName.value
  if (n.includes('extract')) return 'web.extract'
  if (n.includes('search')) return 'web.search'
  if (n === 'stt') return 'tool.stt'
  return 'tool.tts'
})

const toolLabel = computed(() => {
  const map: Record<string, string> = {
    'web.search': '网页搜索', 'web.extract': '网页抓取',
    'tool.tts': '文本转语音', 'tool.stt': '语音转文本',
  }
  return map[iface.value] ?? toolName.value
})

const isToolIface = computed(() => iface.value.startsWith('tool.'))
const allowFallbackToggle = computed(() => iface.value !== 'tool.stt')

interface BuiltinOption { id: string; name: string; description?: string }

const loading = ref(true)
const saving = ref(false)
const providers = ref<Array<WebProviderInfo | AudioToolProviderInfo>>([])
const builtin = ref<BuiltinOption | null>(null)
const activeId = ref<string | null>(null)
const fallback = ref(true)

async function load() {
  loading.value = true
  if (isToolIface.value) {
    const data = await audioToolProviderApi.list(iface.value as 'tool.tts' | 'tool.stt')
    if (data) {
      providers.value = data.providers
      // 内置插件（pluginId 以 builtin- 开头）在 providers 里——无独立 builtin 选项
      builtin.value = null
      activeId.value = data.activeProviderId
      fallback.value = data.fallback
    }
  } else {
    const data = await webProviderApi.list(iface.value as 'web.search' | 'web.extract')
    if (data) {
      providers.value = data.providers
      builtin.value = { id: 'builtin', name: '内置（默认）' }
      activeId.value = data.activePluginId ?? 'builtin'
      fallback.value = data.fallback
    }
  }
  loading.value = false
}

async function selectProvider(id: string) {
  if (saving.value) return
  saving.value = true
  if (isToolIface.value) {
    const data = await audioToolProviderApi.set({ iface: iface.value as 'tool.tts' | 'tool.stt', providerId: id })
    if (data) {
      activeId.value = data.activeProviderId
      fallback.value = data.fallback
    }
  } else {
    const pluginId = id === 'builtin' ? null : id
    const data = await webProviderApi.set({ iface: iface.value as 'web.search' | 'web.extract', pluginId })
    if (data) {
      activeId.value = data.activePluginId ?? 'builtin'
      fallback.value = data.fallback
    }
  }
  saving.value = false
}

async function toggleFallback() {
  if (saving.value) return
  saving.value = true
  if (isToolIface.value) {
    const data = await audioToolProviderApi.set({ iface: iface.value as 'tool.tts' | 'tool.stt', fallback: !fallback.value })
    if (data) {
      activeId.value = data.activeProviderId
      fallback.value = data.fallback
    }
  } else {
    const data = await webProviderApi.set({ iface: iface.value as 'web.search' | 'web.extract', fallback: !fallback.value })
    if (data) {
      activeId.value = data.activePluginId ?? 'builtin'
      fallback.value = data.fallback
    }
  }
  saving.value = false
}

onMounted(load)
</script>

<style scoped>
.tool-provider-settings {
  /* padding 由 L3PageLayout 统一提供 */
  max-width: 680px;
  width: 100%;
}
.tps-loading {
  padding: 24px;
  text-align: center;
  color: var(--tk-text-tertiary);
  font-size: 13px;
}
.tps-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.tps-tool-info {
  padding: 12px;
  background: var(--tk-card-bg);
  border: 1px solid var(--tk-border-card);
  border-radius: 12px;
}
.tps-tool-name {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}
.tps-tool-desc {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  line-height: 1.5;
}
.tps-section-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}
.tps-provider-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tps-provider-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  background: var(--tk-card-bg);
  border: 1px solid var(--tk-border-card);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.tps-provider-row.active {
  border-color: var(--tk-accent);
}
.tps-provider-row input[type='radio'] {
  margin-top: 2px;
  accent-color: var(--tk-accent);
}
.tps-provider-info {
  flex: 1;
}
.tps-provider-name {
  font-size: 13px;
  font-weight: 600;
}
.tps-provider-builtin {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--tk-accent);
  background: rgba(10, 132, 255, 0.1);
  border-radius: 4px;
  vertical-align: 1px;
}
.tps-provider-desc {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  margin-top: 2px;
}
.tps-provider-empty {
  padding: 16px;
  text-align: center;
  color: var(--tk-text-tertiary);
  font-size: 12px;
  background: var(--tk-card-bg);
  border: 1px dashed var(--tk-border-card);
  border-radius: 10px;
}
.tps-fallback-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--tk-card-bg);
  border: 1px solid var(--tk-border-card);
  border-radius: 10px;
  cursor: pointer;
}
.tps-fallback-name {
  font-size: 13px;
  font-weight: 600;
}
.tps-fallback-desc {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  margin-top: 2px;
}
.tps-fallback-row input[type='checkbox'] {
  accent-color: var(--tk-accent);
}

/* Switch 开关（iOS 风格：36×22 track + 滑块 transform 过渡） */
.tps-switch {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  width: 36px;
  height: 22px;
  cursor: pointer;
}

.tps-switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.tps-switch-track {
  position: absolute;
  inset: 0;
  border-radius: 11px;
  background: var(--tk-bg-tertiary);
  transition: background-color 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.tps-switch-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.tps-switch input:checked + .tps-switch-track {
  background: var(--tk-accent);
}

.tps-switch input:checked + .tps-switch-track::after {
  transform: translateX(14px);
}

.tps-switch input:disabled + .tps-switch-track {
  opacity: 0.5;
  cursor: not-allowed;
}
.tps-saving {
  font-size: 12px;
  color: var(--tk-accent);
}
</style>
