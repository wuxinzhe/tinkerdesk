<template>
  <div class="chat-input" :class="{ 'chat-input--disabled': disabled }">
    <div class="chat-input__row">
      <textarea
        ref="textareaRef"
        class="chat-input__textarea"
        :placeholder="placeholder"
        :disabled="disabled"
        :value="modelValue"
        rows="1"
        enterkeyhint="send"
        @input="onInput"
        @keydown="onKeydown"
      />
      <div class="chat-input__btn-group">
        <button
          class="chat-input__send"
          :disabled="disabled || !modelValue.trim()"
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
import { ref, nextTick, watch } from 'vue'
import '@/renderer/api/types'

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

// 切换 session 时重置功能面板 + YOLO 详情为关闭状态（组件复用，状态不跨会话保留）
watch(
  () => props.sessionId,
  () => {
    panelOpen.value = false
    yoloView.value = false
  }
)

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

/* ── 输入框 ── */

.chat-input__textarea {
  flex: 1;
  resize: none;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 14px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif;
  line-height: 1.5;
  color: var(--sa-text-primary, #1d1d1f);
  background: var(--sa-bg-secondary, #f5f5f7);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  max-height: 144px;
  overflow-y: auto;
  scrollbar-width: none;
}

.chat-input__textarea::-webkit-scrollbar {
  display: none;
}

@media (max-width: 767px) {
  .chat-input__textarea {
    font-size: 16px;
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
