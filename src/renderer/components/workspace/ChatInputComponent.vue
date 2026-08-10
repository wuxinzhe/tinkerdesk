<template>
  <div class="chat-input-wrap">
    <div class="chat-input" :class="{ 'chat-input--disabled': disabled }">
      <div class="chat-input__row">
        <!-- 语音输入（点击武装 → 按住音波框/快捷键录音 → 松开识别发送；录音是应用固有功能，STT 转发给语音 provider） -->
        <button
          v-if="sttAvailable"
          class="chat-input__voice"
          :class="{
            'chat-input__voice--armed': voiceMode && !recording,
            'chat-input__voice--recording': recording,
            'chat-input__voice--countdown': countdown > 0
          }"
          :title="voiceMode ? (recording ? '松开结束并识别' : '点击取消录音') : '点击开始语音输入'"
          @click="onVoiceButtonClick"
        >
          <svg v-if="!recording && countdown === 0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          <span v-else-if="recording && countdown > 0" class="chat-input__countdown">{{ countdown }}</span>
          <span v-else class="chat-input__voice-dot"></span>
        </button>

        <!-- 音波框（武装/录音中替换输入框：均线时间轴 + 秒刻度 + 实时波形；按住开始/继续录音） -->
        <Transition name="input-swap" mode="out-in">
          <div
            v-if="voiceMode"
            key="wavebox"
            class="chat-input__wavebox"
            :class="{ 'chat-input__wavebox--recording': recording }"
            @pointerdown="onWaveboxDown"
            @pointerup="onWaveboxUp"
            @pointerleave="onWaveboxLeave"
          >
            <canvas ref="waveCanvasRef" class="chat-input__wave-canvas" />
            <div v-if="!recording" class="chat-input__wave-hint">
              按住开始录音（或按住 {{ shortcutLabel }}）
            </div>
          </div>

          <textarea
            v-else
            key="textarea"
            ref="textareaRef"
            class="chat-input__textarea"
            :placeholder="'Enter 发送，Ctrl+Enter 换行'"
            :disabled="disabled"
            :value="modelValue"
            rows="1"
            enterkeyhint="send"
            @input="onInput"
            @keydown="onKeydown"
          />
        </Transition>
        <div class="chat-input__btn-group">
          <button
            class="chat-input__function"
            :class="{ 'chat-input__function--open': panelOpen }"
            @click="togglePanel"
          >
            <svg
              class="chat-input__function-icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <line x1="12" y1="5" x2="12" y2="19" />
            </svg>
          </button>
        </div>
      </div>

      <!-- 功能面板 -->
      <Transition name="panel-slide">
        <div v-if="panelOpen" class="chat-input__panel">
          <div class="chat-input__panel-inner">
            <div class="chat-input__panel-icons">
              <!-- 历史预览：入栈独立路由页（/workspace/chat/:sessionId/history） -->
              <button
                class="chat-input__panel-icon"
                :title="'历史预览'"
                @click="$emit('history-preview')"
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <rect x="3" y="3" width="7" height="9" rx="1.5" />
                  <rect x="14" y="3" width="7" height="5" rx="1.5" />
                  <rect x="14" y="12" width="7" height="9" rx="1.5" />
                  <rect x="3" y="16" width="7" height="5" rx="1.5" />
                </svg>
                <span>历史预览</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- 设置抽屉（与 chat-input 同级——wrap 内；bottom: calc(100% + 6px) 锚定
         wrap 顶部 = 输入行顶部——panel 撑高的是 wrap 底部，锚定不变） -->
    <ChatSettingsDrawer
      :session-id="sessionId"
      :profile="profile"
      :yolo="yolo"
      @update:yolo="$emit('update:yolo', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import '@/renderer/api/types'
import { showErrorToast } from '@/renderer/utils/notification-utils'
import { getCachedRecordShortcut, setCachedRecordShortcut } from '@/renderer/utils/shortcut-cache'
import ChatSettingsDrawer from './ChatSettingsDrawer.vue'

const props = withDefaults(defineProps<{
  modelValue?: string
  disabled?: boolean
  placeholder?: string
  sessionId?: string | null
  /** Agent 画像标识（YOLO 查询/切换需 profile 限定） */
  profile?: string
  yolo?: boolean
}>(), {
  modelValue: '',
  disabled: false,
  placeholder: '输入消息...',
  sessionId: null,
  profile: 'default',
  yolo: false
})

const emit = defineEmits<{
  send: [content: string]
  'update:modelValue': [value: string]
  'update:yolo': [value: boolean]
  'history-preview': []
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const panelOpen = ref(false)

// ── 语音输入（应用固有录音；STT 由语音 provider 支持） ──
// 状态机：idle（输入框）→ 点击按钮武装 voiceMode → 按住音波框/快捷键录音 → 松开 STT 发送 → idle
const sttAvailable = ref(false)
const voiceMode = ref(false)      // true=输入框切换为音波框（武装/录音中）
const recording = ref(false)
const countdown = ref(0)          // 110s 后剩余秒数（0=未进入倒计时）
const waveCanvasRef = ref<HTMLCanvasElement | null>(null)
let pcmChunks: Float32Array[] = []            // 录音 PCM 分片（onaudioprocess 收集）
let pcmSourceNode: MediaStreamAudioSourceNode | null = null
let pcmProcessor: ScriptProcessorNode | null = null
let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
let waveRaf = 0
let recordingStartedAt = 0
let recordTimer: ReturnType<typeof setTimeout> | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null
let waveHistory: Float32Array[] = []   // 历史波形帧（降采样 64 点/帧）
const shortcutRecord = ref('ctrl+b')  // 录音快捷键（从通用设置加载）
let shortcutHeld = false               // 快捷键按住中

/** 快捷键显示文案（ctrl+backquote → Ctrl+`） */
const shortcutLabel = computed(() =>
  shortcutRecord.value
    .split('+')
    .map((part) => {
      if (part === 'ctrl') return 'Ctrl'
      if (part === 'shift') return 'Shift'
      if (part === 'alt') return 'Alt'
      if (part === 'backquote') return '`'
      return part.length === 1 ? part.toUpperCase() : part
    })
    .join('+')
)

const PX_PER_SEC = 60                  // 音波框时间轴：1 秒固定宽度
const MAX_RECORD_SEC = 120             // 最长录音 120s

/** 启动时检测 STT provider + 加载快捷键配置
 *  （快捷键走 shortcut-cache 模块级缓存——L3 重建不再重复调 settings:general:get） */
async function checkSttAvailability(): Promise<void> {
  try {
    const { stt } = await window.api.voice.providers()
    sttAvailable.value = stt.length > 0
    if (sttAvailable.value) {
      await reloadShortcut()
    }
  } catch {
    sttAvailable.value = false
  }
}

/** 重读录音快捷键（设置页保存/重置后事件驱动——常驻组件不重新挂载也能立即生效） */
async function reloadShortcut(): Promise<void> {
  let record = getCachedRecordShortcut()
  if (record === null) {
    const { settings } = await window.api.generalSettings.get()
    record = settings['shortcut.record'] || 'ctrl+b'
    setCachedRecordShortcut(record)
  }
  shortcutRecord.value = record
}

/** 解析快捷键字符串 → 匹配函数（如 'ctrl+backquote' / 'ctrl+shift+1'；用 e.code 物理键匹配） */
function parseShortcut(value: string): (e: KeyboardEvent) => boolean {
  const parts = value.split('+')
  const mods = {
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    meta: parts.includes('meta')
  }
  const key = parts[parts.length - 1]
  return (e: KeyboardEvent) =>
    e.ctrlKey === mods.ctrl &&
    e.shiftKey === mods.shift &&
    e.altKey === mods.alt &&
    e.metaKey === mods.meta &&
    eventKeyNormalized(e) === key
}

/** 物理键归一（与设置页捕获一致）：Backquote → backquote；KeyB → b；Digit0/Numpad0 → 0 */
function eventKeyNormalized(e: KeyboardEvent): string {
  const code = e.code
  if (code === 'Backquote') return 'backquote'
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(code) || /^Numpad[0-9]$/.test(code)) return code.slice(-1)
  return ''
}

/** 快捷键监听（按一下开始 / 再按一下结束——toggle，与全局快捷键交互一致） */
function onGlobalKeyDown(e: KeyboardEvent): void {
  // 快捷键仅在录音模式（武装/录音中）生效——输入框模式一律不响应，避免误触
  if (!sttAvailable.value || voiceMode.value === false) return
  if (e.repeat) return // 按住重复 keydown 不重复触发
  if (parseShortcut(shortcutRecord.value)(e) && !shortcutHeld && !recording.value) {
    shortcutHeld = true
    e.preventDefault()
    void startRecording()
  } else if (parseShortcut(shortcutRecord.value)(e) && shortcutHeld && recording.value) {
    // 再按一下 → 结束录音并发送
    shortcutHeld = false
    e.preventDefault()
    void stopRecording()
  }
}
function onGlobalKeyUp(e: KeyboardEvent): void {
  // toggle 交互：松开只清 held 标记（不触发停止——避免按住误停）
  if (parseShortcut(shortcutRecord.value)(e) || e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta' || e.key === '`' || e.key === 'Backquote') {
    shortcutHeld = false
  }
}

/**
 * 全局录音快捷键（main globalShortcut 按下 → preload → window 'global-shortcut-record'）
 * 方案 A toggle：没在录 → 开始；在录 → 停止 + STT 发送。
 * 必须已切换到语音输入模式（voiceMode=true——点过麦克风按钮）才生效——与局部快捷键同语义；
 * 120s 上限由 startTimers 统一控制。
 */
function onGlobalRecordShortcut(): void {
  if (!sttAvailable.value || voiceMode.value === false) return
  if (recording.value) {
    void stopRecording()
  } else {
    void startRecording()
  }
}

/** 点击麦克风按钮：idle → 武装；武装 → 取消；录音中忽略 */
function onVoiceButtonClick(): void {
  if (recording.value) return
  if (voiceMode.value) {
    exitVoiceMode()
  } else {
    voiceMode.value = true
    // 武装态：灰色时间轴预览（布局完成后绘制）
    nextTick(() => drawWaveIdle())
  }
}

/** 按住音波框 → 开始录音 */
function onWaveboxDown(e: PointerEvent): void {
  if (e.button !== 0) return
  e.preventDefault()
  if (!recording.value) void startRecording()
}

/** 松开音波框 → 结束录音 */
function onWaveboxUp(): void {
  if (recording.value) void stopRecording()
}

/** 按住期间指针滑出音波框 → 也结束（防漏录） */
function onWaveboxLeave(): void {
  if (recording.value) void stopRecording()
}

/** 开始录音（直接 PCM 采集——ScriptProcessorNode 绕过 MediaRecorder/decodeAudioData，避免 "Unable to decode audio data"） */
async function startRecording(): Promise<void> {
  if (recording.value) return
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    pcmChunks = []
    // 实时音波 + PCM 采集共用同一 AudioContext
    audioContext = audioContext ?? new AudioContext({ sampleRate: 16000 })
    const source = audioContext.createMediaStreamSource(stream)
    pcmSourceNode = source
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.6
    source.connect(analyser)
    // ScriptProcessor 采集 PCM（4096 帧/片）——必须 connect destination 才会被处理（Chromium 优化：无输出连接不触发 onaudioprocess）
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    pcmProcessor = processor
    processor.onaudioprocess = (e) => {
      pcmChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
      // 静音输出（输出置零——避免麦克风回声）
      e.outputBuffer.getChannelData(0).fill(0)
    }
    source.connect(processor)
    processor.connect(audioContext.destination)
    waveHistory = []
    recordingStartedAt = Date.now()
    recording.value = true
    countdown.value = 0
    startWaveLoop()
    startTimers()
  } catch {
    // 麦克风权限被拒等：明确提示（不静默）
    showErrorToast({ code: 'mic:permission:denied', message: '无法访问麦克风，请在系统设置中允许应用使用麦克风' })
  }
}

/** 停止录音 → PCM 降采样 16k → STT → 发送 → 恢复输入框 */
async function stopRecording(): Promise<void> {
  if (!recording.value || !pcmProcessor) return
  recording.value = false
  clearTimers()
  stopWaveLoop()
  waveHistory = []
  clearWaveCanvas() // 结束录音：时间轴隐藏（清空——不再显示均线）
  // 停止采集并释放麦克风
  try {
    pcmProcessor.disconnect()
    pcmSourceNode?.disconnect()
  } catch {
    // 断开失败不影响后续
  }
  pcmProcessor.onaudioprocess = null
  const stream = pcmSourceNode?.mediaStream
  stream?.getTracks().forEach((t) => t.stop())
  const chunks = pcmChunks
  pcmChunks = []
  pcmProcessor = null
  pcmSourceNode = null
  try {
    const samples = concatPcmTo16k(chunks)
    if (samples.length === 0) {
      console.warn('[voice] 录音为空（未检测到声音？）')
      window.dispatchEvent(
        new CustomEvent('global-tip', {
          detail: { type: 'error', code: 'voice:stt', message: '未检测到声音，请靠近麦克风重试' },
        }),
      )
      return
    }
    console.log(`[voice] 录音 ${(samples.length / 16000).toFixed(1)}s → STT`)
    const { text } = await window.api.voice.sttTranscribe(samples)
    const trimmed = text.trim()
    // 录制结束不退出录音模式：停留在音波框（武装态），用户手动点击按钮切回文字输入
    if (trimmed) {
      emit('send', trimmed)
    } else {
      console.warn('[voice] STT 返回空文本')
      window.dispatchEvent(
        new CustomEvent('global-tip', {
          detail: { type: 'error', code: 'voice:stt', message: '语音识别未返回文字，请重试或检查语音设置' },
        }),
      )
    }
  } catch (e) {
    // STT 失败：明确提示（不再静默）
    console.error('[voice] STT 识别失败:', e)
    window.dispatchEvent(
      new CustomEvent('global-tip', {
        detail: { type: 'error', code: 'voice:stt', message: (e as Error).message || '语音识别失败，请重试' },
      }),
    )
  }
}

/** 退出武装/录音（恢复输入框） */
function exitVoiceMode(): void {
  voiceMode.value = false
  recording.value = false
  clearTimers()
  stopWaveLoop()
  clearWaveCanvas() // 清空 canvas——避免切换动画中时间轴蓝线闪现
  waveHistory = []
  if (pcmSourceNode) {
    pcmSourceNode.mediaStream.getTracks().forEach((t) => t.stop())
    pcmSourceNode = null
  }
  pcmProcessor?.disconnect()
  pcmProcessor = null
  pcmChunks = []
}

/** 时长计时：120s 自动结束；110s 起按钮倒计时 */
function startTimers(): void {
  recordTimer = setTimeout(() => {
    if (recording.value) void stopRecording()
  }, MAX_RECORD_SEC * 1000)
  countdownTimer = setInterval(() => {
    if (!recording.value) return
    const elapsed = (Date.now() - recordingStartedAt) / 1000
    countdown.value = Math.max(0, MAX_RECORD_SEC - Math.floor(elapsed))
  }, 1000)
}

function clearTimers(): void {
  if (recordTimer) { clearTimeout(recordTimer); recordTimer = null }
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
  countdown.value = 0
}

// ── 音波框绘制：均线时间轴 + 秒刻度 + 历史波形（1s=60px，超宽自动左滚，无滚动条禁拖拽） ──
function startWaveLoop(): void {
  const draw = () => {
    drawWave()
    waveRaf = requestAnimationFrame(draw)
  }
  waveRaf = requestAnimationFrame(draw)
}

function stopWaveLoop(): void {
  if (waveRaf) { cancelAnimationFrame(waveRaf); waveRaf = 0 }
}

/** 清空音波 canvas（离开音波框时——避免切换动画中时间轴蓝线闪现） */
function clearWaveCanvas(): void {
  const canvas = waveCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
}

function drawWave(): void {
  const canvas = waveCanvasRef.value
  const box = canvas?.parentElement
  if (!canvas || !box) return
  const dpr = window.devicePixelRatio || 1
  const w = box.clientWidth
  const h = box.clientHeight
  if (w === 0 || h === 0) return
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr
    canvas.height = h * dpr
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const midY = h / 2
  // 时间轴均线（灰色——非蓝色）
  ctx.strokeStyle = 'rgba(142, 142, 147, 0.5)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, midY)
  ctx.lineTo(w, midY)
  ctx.stroke()

  // 当前帧波形入历史（降采样 64 点）
  if (recording.value && analyser) {
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteTimeDomainData(data)
    const dec = new Float32Array(64)
    for (let i = 0; i < 64; i++) {
      dec[i] = (data[Math.floor((i / 64) * data.length)] - 128) / 128
    }
    waveHistory.push(dec)
  }
  const frameCount = waveHistory.length
  const totalW = (frameCount / 60) * PX_PER_SEC
  // 超出音波框宽度 → 自动左滚（offset = 超出量；不产生滚动条、不可拖拽）
  const offset = Math.max(0, totalW - w)

  // 时间刻度/数字已移除（用户要求——中轴线上不留数字和刻度）

  // 历史波形（从左滚位置绘制）
  ctx.strokeStyle = 'rgba(0, 122, 255, 0.85)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let f = 0; f < frameCount; f++) {
    const x = f * (PX_PER_SEC / 60) - offset
    if (x < -1) continue
    if (x > w + 1) break
    const dec = waveHistory[f]
    const amp = Math.max(0.02, Math.min(0.45, Math.abs(dec[0]) * 1.5))
    ctx.moveTo(x, midY - amp * midY)
    ctx.lineTo(x, midY + amp * midY)
  }
  ctx.stroke()
}

/** 空态（武装预览）：灰色均线 + 刻度 0 秒 */
function drawWaveIdle(): void {
  const canvas = waveCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const box = canvas.parentElement
  if (!ctx || !box) return
  const w = box.clientWidth
  const h = box.clientHeight
  const dpr = window.devicePixelRatio || 1
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr
    canvas.height = h * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(142, 142, 147, 0.5)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, h / 2)
  ctx.lineTo(w, h / 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(142, 142, 147, 0.7)'
  ctx.font = '10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('0', 24, 28)
}

/** 合并 PCM 分片 + 线性插值降采样 → 16kHz Float32Array 单声道（录音时 AudioContext 即 16k——通常无需重采样） */
function concatPcmTo16k(chunks: Float32Array[]): Float32Array {
  if (chunks.length === 0) return new Float32Array(0)
  let total = 0
  for (const c of chunks) total += c.length
  const merged = new Float32Array(total)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.length
  }
  return merged
}

// 切换 session 时重置功能面板为关闭状态（组件复用，状态不跨会话保留）
watch(
  () => props.sessionId,
  () => {
    panelOpen.value = false
  }
)

onMounted(() => {
  void checkSttAvailability()
  window.addEventListener('keydown', onGlobalKeyDown, true)
  window.addEventListener('keyup', onGlobalKeyUp, true)
  window.addEventListener('global-shortcut-record', onGlobalRecordShortcut)
  window.addEventListener('shortcut-record-changed', reloadShortcut)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeyDown, true)
  window.removeEventListener('keyup', onGlobalKeyUp, true)
  window.removeEventListener('global-shortcut-record', onGlobalRecordShortcut)
  window.removeEventListener('shortcut-record-changed', reloadShortcut)
  exitVoiceMode()
})

function togglePanel() {
  panelOpen.value = !panelOpen.value
}

function onInput(e: Event) {
  const target = e.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
  autoResize(target)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter') return
  // Shift/Ctrl/Cmd+Enter 换行（Ctrl+Enter 在 textarea 默认不插入——显式插入）
  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    if (!e.shiftKey) {
      e.preventDefault()
      insertNewline()
    }
    return
  }
  // 纯 Enter 发送
  e.preventDefault()
  handleSend()
}

/** 在光标处插入换行（Ctrl/Cmd+Enter——textarea 原生不处理） */
function insertNewline() {
  const el = textareaRef.value
  if (!el) return
  el.setRangeText('\n', el.selectionStart, el.selectionEnd, 'end')
  el.dispatchEvent(new Event('input', { bubbles: true }))
  nextTick(() => autoResize(el))
}

function handleSend() {
  const text = props.modelValue.trim()
  if (!text || props.disabled) return
  emit('send', text)
  emit('update:modelValue', '')
  nextTick(() => autoResize(textareaRef.value))
}

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 6 * 24) + 'px'
}

function focus() {
  textareaRef.value?.focus()
}

defineExpose({ focus })
</script>

<style scoped>
/* ── 容器 ── */

/* chat-input-wrap：包裹输入框 + 设置抽屉（drawer absolute 定位基准） */
.chat-input-wrap {
  position: relative;
  flex-shrink: 0;
}

/* ── 输入框主体（贴边结构——顶部描边 + 向上投射阴影） ── */
.chat-input {
  position: relative;   /* 设置抽屉定位基准 */
  z-index: 10;          /* 上层——抽屉（z 下层）从输入框背后拉出 */
  padding: 8px 16px;
  border-top: 1px solid var(--tk-border);
  background: var(--tk-bg-primary);
  /* emil：浮起于消息列表之上——向上投射阴影（hairline 分隔 + 极淡大阴影） */
  box-shadow: 0 -1px 0 rgba(0, 0, 0, 0.02), 0 -6px 24px rgba(0, 0, 0, 0.06);
}

.chat-input--disabled {
  opacity: 0.6;
}

.chat-input__row {
  position: relative;  /* ChatSettingsDrawer 锚定基准（bottom: 100% 在输入行上方） */
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── 语音输入按钮（按住说话） ── */

.chat-input__voice {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: 1px solid var(--tk-border);
  border-radius: 50%;
  background: var(--tk-bg-primary);
  color: var(--tk-text-secondary);
  cursor: pointer;
  transition: background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    border-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 150ms cubic-bezier(0.23, 1, 0.32, 1);
  user-select: none;
}
.chat-input__voice:active {
  transform: scale(0.94);
}
@media (hover: hover) and (pointer: fine) {
  .chat-input__voice:hover {
    border-color: var(--tk-accent);
    color: var(--tk-accent);
  }
}

.chat-input__voice--recording {
  background: var(--tk-destructive);
  border-color: var(--tk-destructive);
  color: #ffffff;
}

/* 武装态（点击后待按住）：蓝色描边提示 */
.chat-input__voice--armed {
  border-color: var(--tk-accent);
  color: var(--tk-accent);
  background: rgba(0, 122, 255, 0.06);
}

/* 110s 后：录音按钮内部 10 秒倒计时 */
.chat-input__voice--countdown {
  background: var(--tk-accent);
  border-color: var(--tk-accent);
  color: #ffffff;
}

.chat-input__countdown {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.chat-input__voice-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ffffff;
  animation: voice-pulse 1s ease-in-out infinite;
}

@keyframes voice-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(0.75); opacity: 0.7; }
}

/* ── 音波框（武装/录音中替换输入框）── Apple HIG：白底细边框、内容 16px 渐隐、刻度顶部短刻度 */

.chat-input__wavebox {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 36px;
  border: 1px solid var(--tk-border);
  border-radius: 10px;
  background: var(--tk-bg-primary);
  overflow: hidden; /* 无滚动条：canvas 内部绘制左滚，禁止拖拽滚动 */
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  transition: border-color 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

/* 录音中：仅边框提示（无蓝色遮罩背景） */
.chat-input__wavebox--recording {
  border-color: var(--tk-accent);
}

.chat-input__wave-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* 不允许拖拽/交互（纯展示） */
  /* 时间轴/波形左右渐隐（等效 16px 内边距——内容不贴边） */
  -webkit-mask-image: linear-gradient(to right, transparent, #000 16px, #000 calc(100% - 16px), transparent);
  mask-image: linear-gradient(to right, transparent, #000 16px, #000 calc(100% - 16px), transparent);
}

.chat-input__wave-hint {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  color: var(--tk-text-tertiary);
  text-align: center;
  pointer-events: none;
}

/* 输入框 ↔ 音波框 切换动画 */
.input-swap-enter-active,
.input-swap-leave-active {
  transition: opacity 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.input-swap-enter-from,
.input-swap-leave-to {
  opacity: 0;
}

/* ── 输入框 ── */

.chat-input__textarea {
  flex: 1;
  resize: none;
  border: 1px solid var(--tk-border);
  border-radius: 12px;
  padding: 7px 14px;
  font-size: 14px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif;
  line-height: 1.4;
  color: var(--tk-text-primary);
  background: var(--tk-bg-secondary);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  min-height: 36px;
  max-height: 144px;
  overflow-y: auto;
  scrollbar-width: none;
  box-sizing: border-box;
}

.chat-input__textarea::-webkit-scrollbar {
  display: none;
}

.chat-input__textarea::placeholder {
  line-height: 1.4;
  color: var(--tk-text-tertiary);
}

@media (max-width: 767px) {
  .chat-input__textarea {
    font-size: 16px;
  }
  /* 手机模式：输入框字号放大（键盘 Enter 发送） */
  .chat-input__textarea::placeholder {
    font-size: 13px;   /* placeholder 缩小——与输入字号拉开层级 */
  }
}

.chat-input__textarea:focus {
  border-color: var(--tk-accent);
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.15);
}

.chat-input__textarea::placeholder {
  color: var(--tk-text-tertiary);
}

.chat-input__textarea:disabled {
  cursor: not-allowed;
}

/* ── 按钮组 ── */

.chat-input__btn-group {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

/* + 号功能按钮（点击展开功能面板） */
.chat-input__function {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--tk-border);
  border-radius: 50%;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-secondary);
  cursor: pointer;
  transition: border-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 150ms cubic-bezier(0.23, 1, 0.32, 1);
}
.chat-input__function:active {
  transform: scale(0.94);
}
@media (hover: hover) and (pointer: fine) {
  .chat-input__function:hover {
    border-color: var(--tk-accent);
    color: var(--tk-accent);
  }
}

/* + 号图标旋转动画（展开 → 旋转 135° 变 X 关闭符） */
.chat-input__function-icon {
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.chat-input__function--open .chat-input__function-icon {
  transform: rotate(135deg);
}

.chat-input__function--open {
  border-color: var(--tk-accent);
  color: var(--tk-accent);
  background: var(--tk-bg-elevated);
}

.chat-input__function-icon {
  display: block;
}


/* ── 功能面板（+ 展开——历史预览等）── */
/* Transition 根元素 = grid 容器。静态 = 展开态（1fr）——Transition class 移除后保持；
   enter-from/leave-to 用 0fr 覆盖初始/结束——动画后回到 1fr 不会裁内容 */
.chat-input__panel {
  margin-top: 8px;
  border-top: 1px solid var(--tk-border);   /* 只有顶部边框——面板贴输入框，与输入框分隔 */
  background: var(--tk-bg-primary);
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 260ms cubic-bezier(0.23, 1, 0.32, 1);
}

/* 内层：overflow 裁剪 + 允许压缩（grid 0fr 收起的关键） */
.chat-input__panel-inner {
  overflow: hidden;
  min-height: 0;
}
.chat-input__panel-icons {
  display: flex;
  flex-wrap: wrap;      /* 宽度不足时换行排布 */
  gap: 8px;
  width: 100%;
  padding: 12px;
}

.chat-input__panel-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 72px;          /* 正方形（不平铺）——图标按钮 */
  height: 72px;
  border: 1px solid var(--tk-border);
  border-radius: 16px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-primary);
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  transition: border-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 150ms cubic-bezier(0.23, 1, 0.32, 1);
}
.chat-input__panel-icon:active {
  transform: scale(0.96);
}
@media (hover: hover) and (pointer: fine) {
  .chat-input__panel-icon:hover {
    border-color: var(--tk-accent);
    background: var(--tk-bg-primary);
  }
}

/* ── 面板滑动动画（Transition 包 grid——enter/leave 切 grid-template-rows） ── */
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: grid-template-rows 260ms cubic-bezier(0.23, 1, 0.32, 1);
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  grid-template-rows: 0fr;
}
.panel-slide-enter-to,
.panel-slide-leave-from {
  grid-template-rows: 1fr;
}

/* ── YOLO 详情过渡 ── */

.yolo-detail-enter-active,
.yolo-detail-leave-active {
  transition: opacity 0.12s, transform 0.12s;
}

.yolo-detail-enter-from,
.yolo-detail-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
