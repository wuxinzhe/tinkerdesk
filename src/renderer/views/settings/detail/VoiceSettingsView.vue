<script setup lang="ts">
/**
 * VoiceSettingsView.vue — 语音设置（系统设置 → 语音设置）
 *
 * 系统固定接口的多 provider 抽象：插件声明 systemInterfaces（voice.stt/voice.tts）即成为 provider。
 * 这里选择当前激活的 STT / TTS provider，并可进入各插件的配置表单（动态 schema 渲染）。
 */
import { ref, onMounted } from 'vue'
import type { VoiceProviderInfo } from '@/renderer/api/types'

const providers = ref<{ stt: VoiceProviderInfo[]; tts: VoiceProviderInfo[] }>({ stt: [], tts: [] })
const config = ref<{ sttProvider: string | null; ttsProvider: string | null }>({ sttProvider: null, ttsProvider: null })
const readyMap = ref<Record<string, boolean>>({})

async function load(): Promise<void> {
  providers.value = await window.api.voice.providers()
  config.value = await window.api.voice.getConfig()
  // 查询各 provider 模型就绪状态（只读展示；下载/配置在插件设置）
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

onMounted(load)
</script>

<template>
  <div class="voice-settings-page">
    <div class="voice-settings-page__header">
      <div class="voice-settings-page__title">语音设置</div>
      <div class="voice-settings-page__desc">
        语音输入（STT）与朗读（TTS）由插件提供（多 provider 可选）。录音是应用固有功能，
        安装声明 <code>voice.stt / voice.tts</code> 接口的插件后即可使用。
      </div>
    </div>

    <!-- 无 provider -->
    <div v-if="providers.stt.length === 0 && providers.tts.length === 0" class="voice-settings-page__empty">
      <div class="voice-settings-page__empty-text">未安装语音插件</div>
      <div class="voice-settings-page__empty-hint">
        到「插件设置」安装声明 voice.stt / voice.tts 接口的插件（如 speech-sherpa）
      </div>
    </div>

    <div v-else class="voice-settings-page__sections">
      <!-- STT provider -->
      <section v-if="providers.stt.length > 0" class="voice-card">
        <div class="voice-card__title">语音输入（STT）</div>
        <div class="voice-card__list">
          <div v-for="p in providers.stt" :key="p.pluginId" class="voice-item">
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
          <div v-for="p in providers.tts" :key="p.pluginId" class="voice-item">
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
.voice-settings-page {
  display: flex;
  flex-direction: column;
  gap: var(--sa-space-5, 20px);
  padding: var(--sa-space-5, 20px) var(--sa-space-6, 24px);
  height: 100%;
  overflow-y: auto;
}

.voice-settings-page__title {
  font-size: var(--sa-fs-title, 20px);
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
}

.voice-settings-page__desc {
  margin-top: var(--sa-space-1, 4px);
  font-size: var(--sa-fs-body, 13px);
  line-height: 1.5;
  color: var(--sa-text-secondary, #86868b);
}

.voice-settings-page__desc code {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  background: var(--sa-bg-secondary, #f5f5f7);
  border-radius: 4px;
  padding: 1px 5px;
}

.voice-settings-page__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sa-space-2, 8px);
  text-align: center;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.voice-settings-page__empty-text {
  font-size: var(--sa-fs-body, 13px);
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
}

.voice-settings-page__empty-hint {
  font-size: var(--sa-fs-caption, 11px);
}

.voice-settings-page__sections {
  display: flex;
  flex-direction: column;
  gap: var(--sa-space-5, 20px);
}

.voice-card {
  padding: var(--sa-space-4, 16px);
  background: var(--sa-bg-primary, #ffffff);
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: var(--sa-radius-lg, 12px);
}

.voice-card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
  margin-bottom: var(--sa-space-3, 12px);
}

.voice-card__list {
  display: flex;
  flex-direction: column;
  gap: var(--sa-space-2, 8px);
}

.voice-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sa-space-3, 12px);
  padding: var(--sa-space-3, 12px);
  background: var(--sa-bg-secondary, #f5f5f7);
  border-radius: 10px;
}

.voice-item__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.voice-item__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--sa-text-primary, #1d1d1f);
}

.voice-item__version {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 400;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.voice-item__ready {
  font-size: 11px;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.voice-item__ready.ok {
  color: var(--sa-success, #34c759);
}

.voice-item__ready.no {
  color: var(--sa-destructive, #ff3b30);
}

.voice-item__actions {
  display: flex;
  gap: var(--sa-space-2, 8px);
  flex-shrink: 0;
}

.voice-item__btn {
  padding: 6px 12px;
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

.voice-item__btn:hover:not(:disabled) {
  border-color: var(--sa-accent, #007aff);
}

.voice-item__btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.voice-item__btn--primary.active {
  color: var(--sa-accent, #007aff);
  border-color: var(--sa-accent, #007aff);
  background: rgba(0, 122, 255, 0.06);
}

.voice-card__hint {
  margin-top: var(--sa-space-3, 12px);
  font-size: 11px;
  color: var(--sa-text-tertiary, #aeaeb2);
  text-align: right;
}
</style>
