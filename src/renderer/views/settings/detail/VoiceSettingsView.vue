<script setup lang="ts">
/**
 * VoiceSettingsView.vue — 语音设置（系统设置 → 语音设置）
 *
 * 系统固定接口的多 provider 抽象：插件声明 systemInterfaces（voice.stt/voice.tts）即成为 provider。
 * 这里选择当前激活的 STT / TTS provider，并可进入各插件的配置表单（动态 schema 渲染）。
 */
import { ref, onMounted } from 'vue'
import type { VoiceProviderInfo } from '@/renderer/api/types'
import { SaPageHero, L3PageLayout } from '@/renderer/components'

/** 进入动画标记（stagger 触发） */
const mounted = ref(false)

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

onMounted(() => {
  void load()
  requestAnimationFrame(() => {
    mounted.value = true
  })
})
</script>

<template>
  <L3PageLayout class="voice-settings-page" :data-mounted="mounted">
    <div class="voice-settings-page__body">
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><path d=&quot;M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z&quot;/><path d=&quot;M19 10v2a7 7 0 01-14 0v-2&quot;/><line x1=&quot;12&quot; y1=&quot;19&quot; x2=&quot;12&quot; y2=&quot;23&quot;/><line x1=&quot;8&quot; y1=&quot;23&quot; x2=&quot;16&quot; y2=&quot;23&quot;/></svg>"
      gradient="linear-gradient(135deg, #bf7af6 0%, #af52de 100%)"
      title="语音设置"
      desc="选择语音输入（STT）和朗读（TTS）提供商"
    />

    <!-- 无 provider -->
    <div v-if="providers.stt.length === 0 && providers.tts.length === 0" class="voice-settings-page__empty">
      <div class="voice-settings-page__empty-text">
        未安装语音插件
      </div>
      <div class="voice-settings-page__empty-hint">
        到「插件设置」安装声明 voice.stt / voice.tts 接口的插件（如 speech-sherpa）
      </div>
    </div>

    <div v-else class="voice-settings-page__sections">
      <!-- STT provider -->
      <section v-if="providers.stt.length > 0" class="voice-card">
        <div class="voice-card__title">
          语音输入（STT）
        </div>
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
        <div class="voice-card__title">
          朗读（TTS）
        </div>
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
  </L3PageLayout>
</template>

<style scoped>
.voice-settings-page {
  display: flex;
  flex-direction: column;
  gap: var(--tk-space-5, 20px);
  
    width: 100%;
  height: 100%;
  overflow-y: auto;
}

.voice-settings-page__title {
  font-size: var(--tk-fs-title);
  font-weight: 600;
  color: var(--tk-text-primary);
}

.voice-settings-page__desc {
  margin-top: var(--tk-space-1, 4px);
  font-size: var(--tk-fs-body);
  line-height: 1.5;
  color: var(--tk-text-secondary);
}

.voice-settings-page__desc code {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  background: var(--tk-bg-secondary);
  border-radius: 4px;
  padding: 1px 5px;
}

.voice-settings-page__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--tk-space-2, 8px);
  text-align: center;
  color: var(--tk-text-tertiary);
}

.voice-settings-page__empty-text {
  font-size: var(--tk-fs-body);
  font-weight: 600;
  color: var(--tk-text-primary);
}

.voice-settings-page__empty-hint {
  font-size: var(--tk-fs-caption);
}

.voice-settings-page__sections {
  display: flex;
  flex-direction: column;
  gap: var(--tk-space-5, 20px);
}

.voice-card {
  padding: var(--tk-space-4, 16px);
  background: var(--tk-bg-primary);
  /* emil：大圆角 + 分层阴影 */
  border: 1px solid var(--tk-border-card);
  border-radius: var(--tk-radius-xl);
  box-shadow: var(--tk-shadow-card);
}

.voice-card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--tk-text-primary);
  margin-bottom: var(--tk-space-3, 12px);
}

.voice-card__list {
  display: flex;
  flex-direction: column;
  gap: var(--tk-space-2, 8px);
}

.voice-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--tk-space-3, 12px);
  padding: var(--tk-space-3, 12px);
  background: var(--tk-bg-secondary);
  border-radius: 10px;
  /* emil：进入 stagger（transitionDelay 由模板按 index 注入） */
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 240ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 240ms cubic-bezier(0.23, 1, 0.32, 1);
}
.voice-settings-page[data-mounted='true'] .voice-item {
  opacity: 1;
  transform: translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  .voice-item {
    opacity: 1;
    transform: none;
    transition: none;
  }
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
  color: var(--tk-text-primary);
}

.voice-item__version {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 400;
  color: var(--tk-text-tertiary);
}

.voice-item__ready {
  font-size: 11px;
  color: var(--tk-text-tertiary);
}

.voice-item__ready.ok {
  color: var(--tk-success);
}

.voice-item__ready.no {
  color: var(--tk-destructive);
}

.voice-item__actions {
  display: flex;
  gap: var(--tk-space-2, 8px);
  flex-shrink: 0;
}

.voice-item__btn {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--tk-text-primary);
  background: var(--tk-bg-primary);
  border: 1px solid var(--tk-border);
  border-radius: 8px;
  cursor: pointer;
  /* emil：指定属性过渡 + 强 ease-out + 按压（transform 由全局 button:active 提供） */
  transition: background-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    border-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

@media (hover: hover) and (pointer: fine) {
  .voice-item__btn:hover:not(:disabled) {
    border-color: var(--tk-accent);
  }
}

.voice-item__btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.voice-item__btn--primary.active {
  color: var(--tk-accent);
  border-color: var(--tk-accent);
  background: rgba(0, 122, 255, 0.06);
}

.voice-card__hint {
  margin-top: var(--tk-space-3, 12px);
  font-size: 11px;
  color: var(--tk-text-tertiary);
  text-align: right;
}
</style>
