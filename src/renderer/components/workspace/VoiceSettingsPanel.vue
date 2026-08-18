<script setup lang="ts">
/**
 * VoiceSettingsPanel.vue — 语音提供商选择面板（STT/TTS provider——嵌入通用设置页）
 *
 * 系统固定接口的多 provider 抽象：扩展声明 systemInterfaces（voice.stt/voice.tts）即成为 provider。
 * 模型下载与 provider 详细配置在「扩展设置」——这里只选择当前激活的 STT / TTS provider。
 *
 * 设计（Emil）：原生 select + 项目统一字段样式（bg-secondary/圆角6/自绘 chevron）——
 * hover 触屏门控、:active 按压缩放、:focus-visible 焦点环、160ms ease-out 过渡。
 */
import { ref, computed, onMounted } from 'vue'
import type { VoiceProviderInfo } from '@/renderer/api/types'

const providers = ref<{ stt: VoiceProviderInfo[]; tts: VoiceProviderInfo[] }>({ stt: [], tts: [] })
const config = ref<{ sttProvider: string | null; ttsProvider: string | null }>({ sttProvider: null, ttsProvider: null })
const readyMap = ref<Record<string, boolean>>({})

/** 只显示就绪的 provider（未就绪不出现——用户补充：只显示一切就绪的选项） */
const sttOptions = computed(() =>
  providers.value.stt.filter((p) => readyMap.value[p.providerId]).map((p) => ({ label: p.name, value: p.providerId })),
)
const ttsOptions = computed(() =>
  providers.value.tts.filter((p) => readyMap.value[p.providerId]).map((p) => ({ label: p.name, value: p.providerId })),
)

async function load(): Promise<void> {
  providers.value = await window.api.voice.providers()
  config.value = await window.api.voice.getConfig()
  // 查询各 provider 就绪状态（统一扩展状态——与扩展列表一致；只读展示——下载/配置在扩展设置）
  const map: Record<string, boolean> = {}
  for (const p of [...providers.value.stt, ...providers.value.tts]) {
    try {
      map[p.providerId] = await window.api.voice.providerReady(p.providerId)
    } catch {
      map[p.providerId] = false
    }
  }
  readyMap.value = map
}

function selectStt(e: Event): void {
  const providerId = (e.target as HTMLSelectElement).value
  if (!providerId) return
  // 保存返回完整配置——merge 只更新 stt（绝不覆盖 tts）
  void window.api.voice.setProvider({ sttProvider: providerId }).then((saved) => {
    config.value = { ...config.value, ...saved }
  })
}

function selectTts(e: Event): void {
  const providerId = (e.target as HTMLSelectElement).value
  if (!providerId) return
  void window.api.voice.setProvider({ ttsProvider: providerId }).then((saved) => {
    config.value = { ...config.value, ...saved }
  })
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="voice-panel">
    <!-- 无 provider -->
    <div v-if="providers.stt.length === 0 && providers.tts.length === 0" class="voice-panel__empty">
      未安装语音扩展——到「扩展设置」安装声明 voice.stt / voice.tts 接口的扩展（如 speech-sherpa）
    </div>

    <div v-else class="voice-panel__rows">
      <!-- STT provider -->
      <div v-if="providers.stt.length > 0" class="voice-panel__row">
        <label class="voice-panel__label">语音输入（STT）</label>
        <div class="voice-panel__select-wrap">
          <select class="voice-panel__select" :value="config.sttProvider ?? ''" @change="selectStt">
            <option value="" disabled>选择 STT 提供商</option>
            <option v-for="p in sttOptions" :key="p.value" :value="p.value">{{ p.label }}</option>
          </select>
        </div>
      </div>

      <!-- TTS provider -->
      <div v-if="providers.tts.length > 0" class="voice-panel__row">
        <label class="voice-panel__label">朗读（TTS）</label>
        <div class="voice-panel__select-wrap">
          <select class="voice-panel__select" :value="config.ttsProvider ?? ''" @change="selectTts">
            <option value="" disabled>选择 TTS 提供商</option>
            <option v-for="p in ttsOptions" :key="p.value" :value="p.value">{{ p.label }}</option>
          </select>
        </div>
      </div>

      <div class="voice-panel__hint">模型下载与 provider 配置请到「扩展设置」</div>
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

/* ── select：项目统一字段样式 + Emil 细节 ── */

.voice-panel__select-wrap {
  position: relative;
  width: 220px;
  flex-shrink: 0;
}

.voice-panel__select {
  width: 100%;
  padding: 7px 30px 7px 10px;
  font-size: 12px;
  font-family: inherit;
  color: var(--tk-text-primary);
  background: var(--tk-bg-secondary);
  border: 1px solid var(--tk-border);
  border-radius: 6px;
  appearance: none;
  cursor: pointer;
  transition: border-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.voice-panel__select:active {
  transform: scale(0.98);
}

.voice-panel__select:focus-visible {
  outline: none;
  border-color: var(--tk-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tk-accent) 18%, transparent);
}

@media (hover: hover) and (pointer: fine) {
  .voice-panel__select:hover {
    border-color: color-mix(in srgb, var(--tk-border) 50%, var(--tk-text-tertiary));
  }
}

/* 自绘 chevron（隐藏原生箭头后的指示器） */
.voice-panel__select-wrap::after {
  content: '';
  position: absolute;
  right: 11px;
  top: 50%;
  width: 7px;
  height: 7px;
  margin-top: -5px;
  border-right: 1.5px solid var(--tk-text-tertiary);
  border-bottom: 1.5px solid var(--tk-text-tertiary);
  transform: rotate(45deg);
  pointer-events: none;
  transition: border-color 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

@media (hover: hover) and (pointer: fine) {
  .voice-panel__select-wrap:hover::after {
    border-color: var(--tk-text-secondary);
  }
}
</style>
