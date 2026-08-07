<template>
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
          <div v-if="!recording" class="chat-input__wave-hint">按住开始录音（或按住 {{ shortcutLabel }}）</div>
        </div>

        <textarea
          v-else
          key="textarea"
          ref="textareaRef"
          class="chat-input__textarea"
          :placeholder="'Enter发送消息，Ctrl+Enter换行'"
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
          class="chat-input__send"
          :disabled="disabled || voiceMode || !modelValue.trim()"
          @click="handleSend"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </button>
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
        <div class="chat-input__panel-icons">
          <!-- 历史预览：入栈独立路由页（/workspace/chat/:sessionId/history） -->
          <button
            class="chat-input__panel-icon"
            :title="'历史预览'"
            @click="$emit('history-preview')"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="3" y="3" width="7" height="9" rx="1.5" />
              <rect x="14" y="3" width="7" height="5" rx="1.5" />
              <rect x="14" y="12" width="7" height="9" rx="1.5" />
              <rect x="3" y="16" width="7" height="5" rx="1.5" />
            </svg>
            <span>历史预览</span>
          </button>

          <button
            class="chat-input__panel-icon"
            :class="{ 'chat-input__panel-icon--active': yoloView }"
            @click="yoloView = !yoloView"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
            <span>YOLO</span>
          </button>
        </div>

        <!-- YOLO 设置详情 -->
        <Transition name="yolo-detail">
          <div v-if="yoloView" class="chat-input__yolo-detail">
            <div class="chat-input__yolo-row">
              <div class="chat-input__yolo-info">
                <div class="chat-input__yolo-title">YOLO 模式</div>
                <div class="chat-input__yolo-desc">开启后跳过所有工具审批，直接执行</div>
              </div>
              <label class="chat-input__switch">
                <input
                  type="checkbox"
                  :checked="yoloEnabled"
                  :disabled="!sessionId"
                  @change="toggleYolo"
                />
                <span class="chat-input__switch-slider" />
              </label>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import '@/renderer/api/types'
import { showErrorToast } from '@/renderer/utils/notification-utils'

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
const yoloView = ref(false)
const yoloEnabled = ref(props.yolo)

// ── 语音输入（应用固有录音；STT 由语音 provider 支持） ──
// 状态机：idle（输入框）→ 点击按钮武装 voiceMode → 按住音波框/快捷键录音 → 松开 STT 发送 → idle
const sttAvailable = ref(false)
const voiceMode = ref(false)      // true=输入框切换为音波框（武装/录音中）
const recording = ref(false)
const countdown = ref(0)          // 110s 后剩余秒数（0=未进入倒计时）
const waveCanvasRef = ref<HTMLCanvasElement | null>(null)
let mediaRecorder: MediaRecorder | null = null
let audioChunks: Blob[] = []
let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
let waveRaf = 0
let recordingStartedAt = 0
let recordTimer: ReturnType<typeof setTimeout> | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null
let waveHistory: Float32Array[] = []   // 历史波形帧（降采样 64 点/帧）
let shortcutRecord = ref('ctrl+b')  // 录音快捷键（从通用设置加载）
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
const COUNTDOWN_AT_SEC = 110           // 110s 起按钮倒计时

/** 启动时检测 STT provider + 加载快捷键配置 */
async function checkSttAvailability(): Promise<void> {
  try {
    const { stt } = await window.api.voice.providers()
    sttAvailable.value = stt.length > 0
    if (sttAvailable.value) {
      const { settings } = await window.api.generalSettings.get()
      shortcutRecord.value = settings['shortcut.record'] || 'ctrl+b'
    }
  } catch {
    sttAvailable.value = false
  }
}

/** 解析快捷键字符串 → 匹配函数（如 'ctrl+backquote' / 'ctrl+shift+1'） */
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
    (key === 'backquote' ? (e.key === '`' || e.key === 'Backquote') : e.key.toLowerCase() === key)
}

/** 快捷键监听（按住开始 / 松开结束） */
function onGlobalKeyDown(e: KeyboardEvent): void {
  // 快捷键仅在录音模式（武装/录音中）生效——输入框模式一律不响应，避免误触
  if (!sttAvailable.value || voiceMode.value === false) return
  if (e.repeat) return // 按住重复 keydown 不重复触发
  if (parseShortcut(shortcutRecord.value)(e) && !shortcutHeld && !recording.value) {
    shortcutHeld = true
    e.preventDefault()
    void startRecording()
  }
}
function onGlobalKeyUp(e: KeyboardEvent): void {
  if (!shortcutHeld) return
  // 组合键任意一个松开即结束
  if (parseShortcut(shortcutRecord.value)(e) || e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta' || e.key === '`' || e.key === 'Backquote') {
    shortcutHeld = false
    if (recording.value) void stopRecording()
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

/** 开始录音 */
async function startRecording(): Promise<void> {
  if (recording.value) return
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    audioChunks = []
    mediaRecorder = new MediaRecorder(stream)
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data)
    }
    mediaRecorder.start()
    // 实时音波：AnalyserNode
    audioContext = audioContext ?? new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.6
    source.connect(analyser)
    waveHistory = []
    recordingStartedAt = Date.now()
    recording.value = true
    countdown.value = 0
    startWaveLoop()
    startTimers()
  } catch {
    // 麦克风权限被拒等：明确提示（不静默）
    showErrorToast({ code: 'MIC_PERMISSION_DENIED', message: '无法访问麦克风，请在系统设置中允许应用使用麦克风' })
  }
}

/** 停止录音 → STT → 发送 → 恢复输入框 */
async function stopRecording(): Promise<void> {
  if (!recording.value || !mediaRecorder) return
  recording.value = false
  clearTimers()
  stopWaveLoop()
  waveHistory = []
  clearWaveCanvas() // 结束录音：时间轴隐藏（清空——不再显示均线）
  const recorder = mediaRecorder
  const chunks = audioChunks
  mediaRecorder = null
  audioChunks = []
  try {
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: chunks[0]?.type ?? 'audio/webm' }))
      recorder.stop()
      recorder.stream.getTracks().forEach((t) => t.stop())
    })
    const samples = await decodeToPcm16k(blob)
    if (samples.length === 0) return
    const { text } = await window.api.voice.sttTranscribe(samples)
    const trimmed = text.trim()
    // 录制结束不退出录音模式：停留在音波框（武装态），用户手动点击按钮切回文字输入
    if (trimmed) {
      emit('send', trimmed)
    }
  } catch {
    // STT 失败：inv 拦截统一提示（同样停留在录音模式）
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
  if (mediaRecorder) {
    mediaRecorder.stream.getTracks().forEach((t) => t.stop())
    mediaRecorder = null
  }
  audioChunks = []
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

  const elapsed = recording.value ? (Date.now() - recordingStartedAt) / 1000 : 0
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

  // 时间刻度（1 秒一格——顶部短刻度，Apple HIG 风格）
  ctx.fillStyle = 'rgba(142, 142, 147, 0.7)'
  ctx.font = '10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  const startSec = Math.floor(offset / PX_PER_SEC)
  const endSec = Math.ceil((offset + w) / PX_PER_SEC)
  for (let s = startSec; s <= endSec; s++) {
    const x = s * PX_PER_SEC - offset
    if (x < 0 || x > w) continue
    ctx.strokeStyle = 'rgba(142, 142, 147, 0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, 6)
    ctx.lineTo(x, 14)
    ctx.stroke()
    ctx.fillText(String(s), x, 28) // 数字与刻度保持间距
  }

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

/** webm/ogg blob → 16kHz Float32Array 单声道 PCM */
async function decodeToPcm16k(blob: Blob): Promise<Float32Array> {
  if (!audioContext) audioContext = new AudioContext()
  const arrayBuffer = await blob.arrayBuffer()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
  const source = audioBuffer.getChannelData(0)
  const srcRate = audioBuffer.sampleRate
  const targetRate = 16000
  if (srcRate === targetRate) return source
  // 线性插值重采样
  const ratio = srcRate / targetRate
  const outLen = Math.floor(source.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio
    const idx = Math.floor(pos)
    const frac = pos - idx
    const next = Math.min(idx + 1, source.length - 1)
    out[i] = source[idx] * (1 - frac) + source[next] * frac
  }
  return out
}

// 切换 session 时重置功能面板 + YOLO 详情为关闭状态（组件复用，状态不跨会话保留）
watch(
  () => props.sessionId,
  () => {
    panelOpen.value = false
    yoloView.value = false
  }
)

onMounted(() => {
  void checkSttAvailability()
  window.addEventListener('keydown', onGlobalKeyDown, true)
  window.addEventListener('keyup', onGlobalKeyUp, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeyDown, true)
  window.removeEventListener('keyup', onGlobalKeyUp, true)
  exitVoiceMode()
})

// 打开 YOLO 面板或切换会话时，向后台查询该 session 的最新 yolo 状态
// （后台不会主动推送，开关状态必须每次打开时刷新，否则永远显示默认 false）
watch(
  () => [yoloView.value, props.sessionId],
  async () => {
    if (!yoloView.value || !props.sessionId) return
    try {
      const data = await window.api.sessions.getYolo(props.profile ?? 'default', props.sessionId)
      yoloEnabled.value = (data as boolean) ?? false
    } catch (err) {
      // 查询失败不能静默——否则开关永远显示默认 false 且无法排查
      console.warn('[yolo] 查询状态异常', err)
    }
  }
)

function togglePanel() {
  panelOpen.value = !panelOpen.value
  if (!panelOpen.value) {
    yoloView.value = false
  }
}

async function toggleYolo() {
  if (!props.sessionId) return
  try {
    const data = await window.api.sessions.toggleYolo(props.profile ?? 'default', props.sessionId)
    yoloEnabled.value = (data as boolean) ?? !yoloEnabled.value
    emit('update:yolo', yoloEnabled.value)
  } catch {
    // 静默失败
  }
}

function onInput(e: Event) {
  const target = e.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
  autoResize(target)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
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

.chat-input {
  padding: 8px 16px;
  border-top: 1px solid var(--sa-border, #d2d2d7);
  background: var(--sa-bg-primary, #ffffff);
}

.chat-input--disabled {
  opacity: 0.6;
}

.chat-input__row {
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
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 50%;
  background: var(--sa-bg-primary, #ffffff);
  color: var(--sa-text-secondary, #86868b);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s, color 0.15s;
  user-select: none;
}

.chat-input__voice:hover {
  border-color: var(--sa-accent, #007aff);
  color: var(--sa-accent, #007aff);
}

.chat-input__voice--recording {
  background: var(--sa-destructive, #ff3b30);
  border-color: var(--sa-destructive, #ff3b30);
  color: #ffffff;
}

/* 武装态（点击后待按住）：蓝色描边提示 */
.chat-input__voice--armed {
  border-color: var(--sa-accent, #007aff);
  color: var(--sa-accent, #007aff);
  background: rgba(0, 122, 255, 0.06);
}

/* 110s 后：录音按钮内部 10 秒倒计时 */
.chat-input__voice--countdown {
  background: var(--sa-accent, #007aff);
  border-color: var(--sa-accent, #007aff);
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
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 10px;
  background: var(--sa-bg-primary, #ffffff);
  overflow: hidden; /* 无滚动条：canvas 内部绘制左滚，禁止拖拽滚动 */
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  transition: border-color 0.2s ease;
}

/* 录音中：仅边框提示（无蓝色遮罩背景） */
.chat-input__wavebox--recording {
  border-color: var(--sa-accent, #007aff);
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
  color: var(--sa-text-tertiary, #aeaeb2);
  text-align: center;
  pointer-events: none;
}

/* 输入框 ↔ 音波框 切换动画 */
.input-swap-enter-active,
.input-swap-leave-active {
  transition: opacity 0.18s ease;
}
.input-swap-enter-from,
.input-swap-leave-to {
  opacity: 0;
}

/* ── 输入框 ── */

.chat-input__textarea {
  flex: 1;
  resize: none;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 12px;
  padding: 7px 14px;
  font-size: 14px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif;
  line-height: 1.4;
  color: var(--sa-text-primary, #1d1d1f);
  background: var(--sa-bg-secondary, #f5f5f7);
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
  color: var(--sa-text-tertiary, #aeaeb2);
}

@media (max-width: 767px) {
  .chat-input__textarea {
    font-size: 16px;
  }
  /* 手机模式：隐藏发送按钮（手机键盘 Enter 发送） */
  .chat-input__send {
    display: none;
  }
}

.chat-input__textarea:focus {
  border-color: var(--sa-accent, #007aff);
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.15);
}

.chat-input__textarea::placeholder {
  color: var(--sa-text-tertiary, #aeaeb2);
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

/* ── 发送按钮（圆形） ── */

.chat-input__send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--sa-accent, #007aff);
  color: #ffffff;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}

.chat-input__send svg {
  display: block;
}

.chat-input__send:hover:not(:disabled) {
  background: var(--sa-accent-hover, #0066d6);
}

.chat-input__send:active:not(:disabled) {
  transform: scale(0.92);
}

.chat-input__send:disabled {
  background: var(--sa-border, #d2d2d7);
  cursor: not-allowed;
}

/* ── 功能按钮（圆形，+ / X 旋转） ── */

.chat-input__function {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 50%;
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-text-primary, #1d1d1f);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.chat-input__function:hover {
  background: var(--sa-bg-primary, #ffffff);
  border-color: var(--sa-accent, #007aff);
}

.chat-input__function--open {
  background: var(--sa-bg-primary, #ffffff);
  border-color: var(--sa-accent, #007aff);
}

.chat-input__function-icon {
  display: block;
  transition: transform 0.25s ease;
}

.chat-input__function--open .chat-input__function-icon {
  transform: rotate(45deg);
}

/* ── 功能面板 ── */

.chat-input__panel {
  margin-top: 8px;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 12px;
  background: var(--sa-bg-primary, #ffffff);
  padding: 12px;
  overflow: hidden;
}

.chat-input__panel-icons {
  display: flex;
  flex-wrap: wrap;      /* 宽度不足时换行排布 */
  gap: 8px;
  width: 100%;
}

.chat-input__panel-icon {
  flex: 1 1 120px;      /* 均分剩余宽度；最小基底 120px，不够就换行 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 10px;
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-text-primary, #1d1d1f);
  cursor: pointer;
  font-size: 11px;
  white-space: nowrap;
  transition: border-color 0.15s, background 0.15s;
}

.chat-input__panel-icon:hover {
  border-color: var(--sa-accent, #007aff);
  background: var(--sa-bg-primary, #ffffff);
}

.chat-input__panel-icon--active {
  border-color: var(--sa-accent, #007aff);
  background: rgba(0, 122, 255, 0.08);
}

/* ── YOLO 详情 ── */

.chat-input__yolo-detail {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--sa-border, #d2d2d7);
}

.chat-input__yolo-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.chat-input__yolo-info {
  flex: 1;
}

.chat-input__yolo-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--sa-text-primary, #1d1d1f);
}

.chat-input__yolo-desc {
  font-size: 12px;
  color: var(--sa-text-tertiary, #aeaeb2);
  margin-top: 2px;
}

/* ── Toggle Switch ── */

.chat-input__switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 26px;
  flex-shrink: 0;
}

.chat-input__switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.chat-input__switch-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--sa-border, #d2d2d7);
  border-radius: 13px;
  transition: background 0.2s;
}

.chat-input__switch-slider::before {
  content: '';
  position: absolute;
  width: 22px;
  height: 22px;
  left: 2px;
  bottom: 2px;
  background: #ffffff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.chat-input__switch input:checked + .chat-input__switch-slider {
  background: var(--sa-accent, #007aff);
}

.chat-input__switch input:checked + .chat-input__switch-slider::before {
  transform: translateX(18px);
}

/* ── 面板滑动动画（0.25s） ── */

.panel-slide-enter-active {
  transition: all 0.25s ease;
}

.panel-slide-leave-active {
  transition: all 0.2s ease;
}

.panel-slide-enter-from {
  opacity: 0;
  transform: translateY(-10px);
  max-height: 0;
}

.panel-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
  max-height: 0;
}

.panel-slide-enter-to,
.panel-slide-leave-from {
  max-height: 300px;
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
