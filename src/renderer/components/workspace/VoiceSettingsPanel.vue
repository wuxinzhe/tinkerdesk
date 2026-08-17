<script setup lang="ts">
/**
 * VoiceSettingsPanel.vue — 语音提供商选择面板（STT/TTS provider——嵌入通用设置页）
 *
 * 系统固定接口的多 provider 抽象：插件声明 systemInterfaces（voice.stt/voice.tts）即成为 provider。
 * 模型下载与 provider 详细配置在「插件设置」——这里只选择当前激活的 STT / TTS provider。
 */
import { ref, computed, onMounted } from 'vue'
import type { VoiceProviderInfo } from '@/renderer/api/types'
import { NSelect } from 'naive-ui'

const providers = ref<{ stt: VoiceProviderInfo[]; tts: VoiceProviderInfo[] }>({ stt: [], tts: [] })
const config = ref<{ sttProvider: string | null; ttsProvider: string | null }>({ sttProvider: null, ttsProvider: null })
const readyMap = ref<Record<string, boolean>>({})

/** 只显示就绪的 provider（未就绪不出现——用户补充：只显示一切就绪的选项） */
const sttOptions = computed(() =>
  providers.value.stt.filter((p) => readyMap.value[p.pluginId]).map((p) => ({ label: p.name, value: p.pluginId })),
)
const ttsOptions = computed(() =>
  providers.value.tts.filter((p) => readyMap.value[p.pluginId]).map((p) => ({ label: p.name, value: p.pluginId })),
)

async function load(): Promise<void> {
  providers.value = await window.api.voice.providers()
  config.value = await window.api.voice.getConfig()
  // 查询各 provider 就绪状态（统一插件状态——与插件列表一致；只读展示——下载/配置在插件设置）
  const map: Record<string, boolean> = {}
  for (const p of [...providers.value.stt, ...providers.value.tts]) {
    try {
      map[p.pluginId] = await window.api.voice.providerReady(p.pluginId)
    } catch {
      map[p.pluginId] = false
    }
  }
  readyMap.value = map
}

async function selectStt(pluginId: string | null): Promise<void> {
  if (!pluginId) return
  await window.api.voice.setProvider({ sttProvider: pluginId })
  config.value = await window.api.voice.getConfig()
}

async function selectTts(pluginId: string | null): Promise<void> {
  if (!pluginId) return
  await window.api.voice.setProvider({ ttsProvider: pluginId })
  config.value = await window.api.voice.getConfig()
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="voice-panel">
    <!-- 无 provider -->
    <div v-if="providers.stt.length === 0 && providers.tts.length === 0" class="voice-panel__empty">
      未安装语音插件——到「插件设置」安装声明 voice.stt / voice.tts 接口的插件（如 speech-sherpa）
    </div>

    <div v-else class="voice-panel__rows">
      <!-- STT provider -->
      <div v-if="providers.stt.length > 0" class="voice-panel__row">
        <label class="voice-panel__label">语音输入（STT）</label>
        <NSelect
          :value="config.sttProvider"
          :options="sttOptions"
          placeholder="选择 STT 提供商"
          size="small"
          style="width: 220px"
          @update:value="selectStt"
        />
      </div>

      <!-- TTS provider -->
      <div v-if="providers.tts.length > 0" class="voice-panel__row">
        <label class="voice-panel__label">朗读（TTS）</label>
        <NSelect
          :value="config.ttsProvider"
          :options="ttsOptions"
          placeholder="选择 TTS 提供商"
          size="small"
          style="width: 220px"
          @update:value="selectTts"
        />
      </div>

      <div class="voice-panel__hint">模型下载与 provider 配置请到「插件设置」</div>
    </div>
  </div>
</template>

<style scoped>
/* 与 GeneralSettingsView 其他设置组（快捷键/用户记忆）统一：
   padding 行 + border-top 分隔 + label 主色 */
.voice-panel__rows {
  display: flex;
  flex-direction: column;
}

.voice-panel__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 16px;
  border-top: 1px solid var(--tk-border);
}

.voice-panel__label {
  font-size: 13px;
  color: var(--tk-text-primary);
  flex-shrink: 0;
}

.voice-panel__hint {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  padding: 10px 16px;
  border-top: 1px solid var(--tk-border);
}

.voice-panel__empty {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  padding: 4px 0;
}
</style>
