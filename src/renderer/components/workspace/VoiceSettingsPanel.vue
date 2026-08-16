<script setup lang="ts">
/**
 * VoiceSettingsPanel.vue — 语音提供商选择面板（STT/TTS provider——嵌入通用设置页）
 *
 * 系统固定接口的多 provider 抽象：插件声明 systemInterfaces（voice.stt/voice.tts）即成为 provider。
 * 模型下载与 provider 详细配置在「插件设置」——这里只选择当前激活的 STT / TTS provider。
 */
import { ref, onMounted } from 'vue'
import type { VoiceProviderInfo } from '@/renderer/api/types'

const providers = ref<{ stt: VoiceProviderInfo[]; tts: VoiceProviderInfo[] }>({ stt: [], tts: [] })
const config = ref<{ sttProvider: string | null; ttsProvider: string | null }>({ sttProvider: null, ttsProvider: null })
const readyMap = ref<Record<string, boolean>>({})

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

async function selectStt(pluginId: string): Promise<void> {
  await window.api.voice.setProvider({ sttProvider: pluginId })
  config.value = await window.api.voice.getConfig()
}

async function selectTts(pluginId: string): Promise<void> {
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
      <div class="voice-panel__empty-text">未安装语音插件</div>
      <div class="voice-panel__empty-hint">到「插件设置」安装声明 voice.stt / voice.tts 接口的插件（如 speech-sherpa）</div>
    </div>

    <div v-else class="voice-panel__sections">
      <!-- STT provider -->
      <section v-if="providers.stt.length > 0" class="voice-card">
        <div class="voice-card__title">语音输入（STT）</div>
        <div class="voice-card__list">
          <div v-for="(p, i) in providers.stt" :key="p.pluginId" class="voice-item" :style="{ transitionDelay: `${i * 40}ms` }">
            <div class="voice-item__info">
              <div class="voice-item__name">
                {{ p.name }}
                <span class="voice-item__version">v{{ p.version }}</span>
              </div>
              <div class="voice-item__ready" :class="readyMap[p.pluginId] === undefined ? '' : readyMap[p.pluginId] ? 'ok' : 'no'">
                {{ readyMap[p.pluginId] ? '模型就绪' : '模型未就绪' }}
              </div>
            </div>
            <div class="voice-item__actions">
              <button
                class="voice-item__btn voice-item__btn--primary"
                :disabled="config.sttProvider === p.pluginId"
                @click="selectStt(p.pluginId)"
              >
                {{ config.sttProvider === p.pluginId ? '当前使用' : '使用' }}
              </button>
            </div>
          </div>
        </div>
        <div v-if="!readyMap[providers.stt[0]?.pluginId ?? '']" class="voice-card__hint">
          模型下载与 provider 配置请到「插件设置」
        </div>
      </section>

      <!-- TTS provider -->
      <section v-if="providers.tts.length > 0" class="voice-card">
        <div class="voice-card__title">朗读（TTS）</div>
        <div class="voice-card__list">
          <div v-for="(p, i) in providers.tts" :key="p.pluginId" class="voice-item" :style="{ transitionDelay: `${i * 40}ms` }">
            <div class="voice-item__info">
              <div class="voice-item__name">
                {{ p.name }}
                <span class="voice-item__version">v{{ p.version }}</span>
              </div>
              <div class="voice-item__ready" :class="readyMap[p.pluginId] === undefined ? '' : readyMap[p.pluginId] ? 'ok' : 'no'">
                {{ readyMap[p.pluginId] ? '模型就绪' : '模型未就绪' }}
              </div>
            </div>
            <div class="voice-item__actions">
              <button
                class="voice-item__btn voice-item__btn--primary"
                :disabled="config.ttsProvider === p.pluginId"
                @click="selectTts(p.pluginId)"
              >
                {{ config.ttsProvider === p.pluginId ? '当前使用' : '使用' }}
              </button>
            </div>
          </div>
        </div>
        <div v-if="!readyMap[providers.tts[0]?.pluginId ?? '']" class="voice-card__hint">
          模型下载与 provider 配置请到「插件设置」
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.voice-panel__sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.voice-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 0;
  text-align: center;
  color: var(--tk-text-tertiary);
}

.voice-panel__empty-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--tk-text-primary);
}

.voice-panel__empty-hint {
  font-size: 12px;
}

.voice-card {
  border: 1px solid var(--tk-border);
  border-radius: 10px;
  background: var(--tk-bg-primary);
  padding: 16px;
}

.voice-card__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tk-text-primary);
  margin-bottom: 12px;
}

.voice-card__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.voice-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--tk-border);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.voice-item:hover {
  border-color: var(--tk-text-tertiary);
  background: var(--tk-bg-secondary);
}

.voice-item__info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.voice-item__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--tk-text-primary);
}

.voice-item__version {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  font-family: 'SF Mono', 'Menlo', monospace;
  margin-left: 6px;
}

.voice-item__ready {
  font-size: 11px;
  color: var(--tk-text-tertiary);
}

.voice-item__ready.ok {
  color: var(--tk-success, #34c759);
}

.voice-item__ready.no {
  color: var(--tk-warning, #ff9f0a);
}

.voice-item__actions {
  flex-shrink: 0;
}

.voice-item__btn {
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--tk-border);
  background: var(--tk-bg-secondary);
  color: var(--tk-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.voice-item__btn--primary {
  border-color: transparent;
  background: var(--tk-accent);
  color: #fff;
}

.voice-item__btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.voice-card__hint {
  margin-top: 10px;
  font-size: 11px;
  color: var(--tk-text-tertiary);
}
</style>
