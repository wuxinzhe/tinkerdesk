<script setup lang="ts">
/**
 * VoiceSettingsView.vue — 语音设置（系统设置 → 语音设置）
 *
 * 系统固定接口的多 provider 抽象：插件声明 systemInterfaces（voice.stt/voice.tts）即成为 provider。
 * 这里选择当前激活的 STT / TTS provider，并可进入各插件的配置表单（动态 schema 渲染）。
 */
import { ref, onMounted } from 'vue'
import { pluginsApi } from '@/renderer/api/plugins-api'
import PluginConfigForm from '@/renderer/components/settings/PluginConfigForm.vue'
import type { ConfigSchema, PluginInfo, VoiceProviderInfo } from '@/renderer/api/types'

const providers = ref<{ stt: VoiceProviderInfo[]; tts: VoiceProviderInfo[] }>({ stt: [], tts: [] })
const config = ref<{ sttProvider: string | null; ttsProvider: string | null }>({ sttProvider: null, ttsProvider: null })
const readyMap = ref<Record<string, boolean>>({})

/** provider 配置弹层 */
const configOpen = ref(false)
const configPluginId = ref('')
const configSchema = ref<ConfigSchema | null>(null)
const configInitial = ref<Record<string, unknown>>({})

async function load(): Promise<void> {
  providers.value = await window.api.voice.providers()
  config.value = await window.api.voice.getConfig()
  // 查询各 provider 模型就绪状态
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

/** 打开插件配置表单 */
async function openProviderConfig(pluginId: string): Promise<void> {
  configPluginId.value = pluginId
  configOpen.value = true
  configSchema.value = await pluginsApi.getSchema(pluginId)
  configInitial.value = await pluginsApi.getConfig(pluginId)
}

async function saveProviderConfig(patch: Record<string, unknown>): Promise<void> {
  await pluginsApi.saveConfig(configPluginId.value, patch)
  configOpen.value = false
}

/** 下载缺失模型（经插件 models:download） */
async function downloadModels(p: VoiceProviderInfo): Promise<void> {
  try {
    const result = await pluginsApi.invokePlugin(p.pluginId, 'models:download')
    await load()
  } catch {
    // 错误提示由 inv 拦截统一派发
  }
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
                v-if="readyMap[p.pluginId] === false"
                class="voice-item__btn"
                @click="downloadModels(p)"
              >
                下载模型
              </button>
              <button
                v-if="!readyMap[p.pluginId]"
                class="voice-item__btn"
                @click="openProviderConfig(p.pluginId)"
              >
                配置
              </button>
              <button
                class="voice-item__btn voice-item__btn--primary"
                :class="{ active: config.sttProvider === p.pluginId }"
                :disabled="config.sttProvider === p.pluginId"
                @click="selectStt(p.pluginId)"
              >
                {{ config.sttProvider === p.pluginId ? '当前使用' : '使用' }}
              </button>
            </div>
          </div>
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
                v-if="readyMap[p.pluginId] === false"
                class="voice-item__btn"
                @click="downloadModels(p)"
              >
                下载模型
              </button>
              <button
                v-if="!readyMap[p.pluginId]"
                class="voice-item__btn"
                @click="openProviderConfig(p.pluginId)"
              >
                配置
              </button>
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
      </section>
    </div>

    <!-- 配置弹层 -->
    <Teleport to="body">
      <div v-if="configOpen" class="voice-overlay" @click.self="configOpen = false">
        <div class="voice-modal">
          <div class="voice-modal__header">
            <div class="voice-modal__title">provider 配置</div>
            <button class="voice-modal__close" title="关闭" @click="configOpen = false">✕</button>
          </div>
          <div v-if="!configSchema" class="voice-modal__none">该插件未声明配置项</div>
          <PluginConfigForm
            v-else
            :plugin-id="configPluginId"
            :schema="configSchema"
            :initial="configInitial"
            @save="saveProviderConfig"
          />
        </div>
      </div>
    </Teleport>
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

.voice-overlay {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
}

.voice-modal {
  width: min(420px, calc(100vw - 48px));
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  padding: var(--sa-space-5, 20px);
  background: var(--sa-bg-primary, #ffffff);
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}

.voice-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sa-space-4, 16px);
}

.voice-modal__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
}

.voice-modal__close {
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

.voice-modal__close:hover {
  background: var(--sa-bg-secondary, #f5f5f7);
}

.voice-modal__none {
  font-size: 13px;
  color: var(--sa-text-tertiary, #aeaeb2);
  text-align: center;
  padding: var(--sa-space-5, 20px) 0;
}
</style>
