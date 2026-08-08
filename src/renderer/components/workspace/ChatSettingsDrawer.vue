<template>
  <!-- 设置抽屉（独立组件：toggle + 抽屉主体——等高贴输入框；bottom 切换展开/收起） -->
  <div class="chat-settings-drawer" ref="rootRef">
    <!-- 抽屉主体（与 chat-input 等高——toggle 在顶部中间——一行横排：标题在控件左侧——间距 16px） -->
    <div
      class="chat-settings-drawer__panel"
      :class="{ 'chat-settings-drawer__panel--open': open }"
    >
      <!-- toggle（panel 顶部中间——随 panel 一起移动；收起 ︿ / 展开 ﹀） -->
      <button
        class="chat-settings-drawer__toggle"
        :class="{ 'chat-settings-drawer__toggle--open': open }"
        :title="open ? '收起设置' : '展开设置'"
        @click="open = !open"
      >
        <span
        class="chat-settings-drawer__arrow"
        :class="open ? 'chat-settings-drawer__arrow--open' : 'chat-settings-drawer__arrow--close'"
      >{{ open ? '﹀' : '︿' }}</span>
      </button>
      <div class="chat-settings-drawer__row">
        <div class="chat-settings-drawer__field">
          <span class="chat-settings-drawer__field-label">模型</span>
          <select
            class="chat-settings-drawer__select"
            :value="currentMainId || ''"
            :disabled="models.length === 0"
            @change="onModelChange"
          >
            <option v-if="models.length === 0" value="">无模型</option>
            <option v-for="m in models" :key="m.id" :value="m.id">{{ m.modelName }}</option>
          </select>
        </div>
        <div class="chat-settings-drawer__field">
          <span class="chat-settings-drawer__field-label">推理深度</span>
          <div
            class="chat-settings-drawer__range"
            ref="rangeRef"
            @pointerdown="onRangePointerDown"
          >
            <div class="chat-settings-drawer__range-track">
              <div
                class="chat-settings-drawer__range-fill"
                :style="{ width: `calc(20px + ${rangeFillPercent * 0.78}px)` }"
              />
            </div>
            <div
              class="chat-settings-drawer__range-thumb"
              :style="{ left: `calc(8px + ${rangeFillPercent * 0.78}px)` }"
            />
          </div>
        </div>
        <div class="chat-settings-drawer__field">
          <span class="chat-settings-drawer__field-label">YOLO</span>
          <label class="chat-settings-drawer__switch">
            <input
              type="checkbox"
              :checked="yoloEnabled"
              :disabled="!sessionId"
              @change="toggleYolo"
            />
            <span class="chat-settings-drawer__switch-slider" />
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { showErrorToast } from '@/renderer/utils/notification-utils'
import { modelsApi } from '@/renderer/api/models-api'

const props = withDefaults(defineProps<{
  /** 会话 ID（YOLO 查询/切换、推理深度持久化需要；null=未进入会话） */
  sessionId?: string | null
  /** Agent 画像标识 */
  profile?: string
  /** 初始 YOLO 状态（父级传入——切换后 emit） */
  yolo?: boolean
}>(), {
  sessionId: null,
  profile: 'default',
  yolo: false,
})

const emit = defineEmits<{
  'update:yolo': [value: boolean]
}>()

const rootRef = ref<HTMLElement | null>(null)
const open = ref(false)

// ── chat-input 测量（drawer 相对 chat-input-wrap 定位：展开底=输入框顶 / 收起只下移 panel 高） ──
let resizeObs: ResizeObserver | null = null
function updateMetrics() {
  const root = rootRef.value
  if (!root) return
  const wrap = root.parentElement
  const chatInput = wrap?.querySelector('.chat-input') as HTMLElement | null
  if (!wrap || !chatInput) return
  const h = chatInput.offsetHeight
  wrap.style.setProperty('--chat-settings-open', `${h}px`)        // 展开：底 = 输入框顶
  // 收起偏移由 CSS 变量控制（.chat-settings-drawer 定义 + @media 手机模式覆盖——内联会压过 @media，不能设）
}

// ── 模型（select 数据源） ──
const models = ref<Array<{ id: string; alias: string; modelName: string }>>([])
const currentMainId = ref('')

async function loadModels(): Promise<void> {
  try {
    const all = await modelsApi.listCustomModels(props.profile)
    models.value = (all ?? []).filter((m) => m.enabled !== false).map((m) => ({ id: m.id, alias: m.alias, modelName: m.modelName }))
    const scenes = await modelsApi.listSceneModels(props.profile)
    const chat = (scenes ?? []).find((s) => s.sceneId === 'main_conversation')
    const main = chat?.bindings.find((b) => b.isMain)
    currentMainId.value = main?.modelId ?? chat?.bindings[0]?.modelId ?? ''
  } catch {
    models.value = []
  }
}

/** 模型 select 切换：设为主对话场景主模型（未配置自动加入 + is_main=1） */
async function onModelChange(e: Event): Promise<void> {
  const id = (e.target as HTMLSelectElement).value
  if (!id || id === currentMainId.value) return
  try {
    await modelsApi.bindSceneModel(props.profile, { sceneId: 'main_conversation', modelId: id, isMain: true })
    currentMainId.value = id
    window.dispatchEvent(new CustomEvent('global-tip', {
      detail: { type: 'tip', code: 'model:switch:ok', message: `主模型已切换为 ${models.value.find((m) => m.id === id)?.alias ?? id}` },
    }))
  } catch (err) {
    showErrorToast({ code: 'model:switch:error', message: `切换主模型失败: ${(err as Error).message}` })
  }
}

// ── 推理深度（0=low / 1=medium / 2=high——sessions.reasoning_depth；自绘滑块） ──
const REASONING_DEPTHS = ['low', 'medium', 'high'] as const
const reasoningDepthIndex = ref(1)
const rangeRef = ref<HTMLElement | null>(null)
const rangeFillPercent = computed(() => (reasoningDepthIndex.value / 2) * 100)

function applyReasoningDepth(value: number): void {
  reasoningDepthIndex.value = value
  const depth = REASONING_DEPTHS[value] ?? 'medium'
  if (props.sessionId) {
    void window.api.sessions.setReasoningDepth(props.profile, props.sessionId, depth)
  }
}

/** pointer 位置 → 三档值（0/1/2） */
function rangeValueFromEvent(e: PointerEvent): number {
  const el = rangeRef.value
  if (!el) return reasoningDepthIndex.value
  const rect = el.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  return Math.round(ratio * 2)
}

function onRangePointerDown(e: PointerEvent): void {
  e.preventDefault()
  const el = rangeRef.value
  if (!el) return
  reasoningDepthIndex.value = rangeValueFromEvent(e)   // 点击即更新 UI（不调 IPC）
  const onMove = (ev: PointerEvent) => {
    reasoningDepthIndex.value = rangeValueFromEvent(ev) // 拖动只更新 UI
  }
  const onUp = (ev: PointerEvent) => {
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
    applyReasoningDepth(rangeValueFromEvent(ev))        // 松手持久化一次
  }
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
}

// ── YOLO（打开抽屉时刷新真实状态——后台不主动推送） ──
const yoloEnabled = ref(props.yolo)

watch(
  () => [open.value, props.sessionId],
  async () => {
    if (!open.value || !props.sessionId) return
    try {
      const data = await window.api.sessions.getYolo(props.profile, props.sessionId)
      yoloEnabled.value = (data as boolean) ?? false
    } catch (err) {
      console.warn('[yolo] 查询状态异常', err)
    }
    // 推理深度 per-session——打开抽屉时同步当前会话的值
    try {
      const depth = await window.api.sessions.getReasoningDepth(props.profile, props.sessionId)
      const idx = REASONING_DEPTHS.indexOf(depth as (typeof REASONING_DEPTHS)[number])
      reasoningDepthIndex.value = idx >= 0 ? idx : 1
    } catch (err) {
      console.warn('[reasoning-depth] 查询状态异常', err)
    }
  }
)

async function toggleYolo(e: Event): Promise<void> {
  if (!props.sessionId) return
  const checked = (e.target as HTMLInputElement).checked
  try {
    await window.api.sessions.toggleYolo(props.profile, props.sessionId)
    yoloEnabled.value = checked
    emit('update:yolo', checked)
  } catch (err) {
    showErrorToast({ code: 'yolo:toggle:error', message: `切换 YOLO 失败: ${(err as Error).message}` })
    yoloEnabled.value = !checked
  }
}

onMounted(() => {
  void loadModels()
  updateMetrics()
  resizeObs = new ResizeObserver(() => updateMetrics())
  const chatInput = rootRef.value?.parentElement?.querySelector('.chat-input')
  if (chatInput) resizeObs.observe(chatInput)
})

onBeforeUnmount(() => {
  resizeObs?.disconnect()
  resizeObs = null
})
</script>

<style scoped>
/* ── 设置抽屉（独立组件——贴 chat-input；展开底=输入框顶 / 收起底=输入框底） ── */

/* toggle（panel 顶部中间——随 panel 移动——收起 ︿ / 展开 ﹀） */
.chat-settings-drawer__toggle {
  align-self: center;         /* 横向居中（panel 中间） */
  position: relative;
  z-index: 9;                 /* 与 panel 同层——盖在输入框区域 */
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-bottom: none;
  border-radius: 9px 9px 0 0;
  background: var(--sa-bg-elevated, #ffffff);
  color: var(--sa-text-tertiary, #aeaeb2);
  cursor: pointer;
  transition: color 0.15s;
}

.chat-settings-drawer__toggle:hover {
  color: var(--sa-accent, #007aff);
}

.chat-settings-drawer__toggle--open {
  color: var(--sa-accent, #007aff);
}

.chat-settings-drawer__arrow {
  font-size: 11px;
  line-height: 1;
  font-weight: 700;
}

.chat-settings-drawer__arrow--open {
  padding-top: 10px;         /* 展开（箭头 ﹀）——上移 */
}

.chat-settings-drawer__arrow--close {
  padding-bottom: 3px;       /* 收起（箭头 ︿）——下移 */
}

/* 收起偏移（CSS 变量——默认 6px；手机模式 @media 覆盖另一值） */
.chat-settings-drawer {
  --chat-settings-closed: 6px;
}

/* 抽屉主体（高度自适应内容——bottom 切换动画） */
.chat-settings-drawer__panel {
  position: absolute;
  right: 16px;
  bottom: var(--chat-settings-closed, 0px);   /* 收起：只下移 panel 高——toggle 露在输入框顶 */
  z-index: 9;                                 /* 下层（被输入框压住） */
  width: fit-content;
  max-width: 100%;
  transition: bottom 0.25s ease;
  display: flex;
  flex-direction: column;
}

.chat-settings-drawer__panel--open {
  bottom: var(--chat-settings-open, 50px);    /* 展开：底 = chat-input 顶（刚好到达） */
}

/* 内部：一行横排——标题在控件左侧——间距 16px */
.chat-settings-drawer__row {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  border-radius: 10px 10px 0 0;
  background: var(--sa-bg-elevated, #ffffff);
  box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.12);
  padding: 10px;         /* 四周 10px */
}

/* 手机模式（≤767px）：设置选项从并列改堆叠——每个 field 独占一行 */
@media (max-width: 767px) {
  .chat-settings-drawer {
    --chat-settings-closed: -61px;  /* 手机模式收起偏移：panel 下移 61px（藏入下方——只露 toggle） */
  }
  .chat-settings-drawer__row {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 8px 12px;
  }
  .chat-settings-drawer__field {
    justify-content: space-between;   /* label 左、控件右——两端对齐 */
  }
}

.chat-settings-drawer__field {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.chat-settings-drawer__field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--sa-text-secondary, #86868b);
  white-space: nowrap;
}

.chat-settings-drawer__select {
  min-width: 96px;
  max-width: 140px;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 7px;
  background: var(--sa-bg-primary, #ffffff);
  font-size: 11px;
  color: var(--sa-text-primary, #1d1d1f);
  outline: none;
}

.chat-settings-drawer__select:focus {
  border-color: var(--sa-accent, #007aff);
}

/* 推理深度滑块（自绘——粗胶囊轨道 + 圆角长方形把手；26px 高与 YOLO Switch 一致） */
.chat-settings-drawer__range {
  position: relative;
  width: 110px;
  height: 26px;            /* 与 YOLO Switch（26px）保持一致 */
  display: flex;
  align-items: center;
  cursor: pointer;
  touch-action: none;
}

.chat-settings-drawer__range-track {
  width: 100%;
  height: 16px;
  border-radius: 8px;      /* 16px 高——半高圆角胶囊 */
  background: var(--sa-border, #d2d2d7);
}

.chat-settings-drawer__range-fill {
  height: 100%;
  border-radius: 8px;
  background: var(--sa-accent, #007aff);
}

.chat-settings-drawer__range-thumb {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  border-radius: 6px;      /* 圆角长方形 */
  background: #ffffff;
  border: 1px solid var(--sa-accent, #007aff);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}

/* 把手内两条灰色横线 */
.chat-settings-drawer__range-thumb::before,
.chat-settings-drawer__range-thumb::after {
  content: '';
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 8px;
  height: 2px;
  border-radius: 1px;
  background: #c7c7cc;
}

.chat-settings-drawer__range-thumb::before {
  top: 6px;
}

.chat-settings-drawer__range-thumb::after {
  top: 12px;
}

/* Toggle Switch（YOLO） */
.chat-settings-drawer__switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 26px;
  flex-shrink: 0;
}

.chat-settings-drawer__switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.chat-settings-drawer__switch-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--sa-border, #d2d2d7);
  border-radius: 13px;
  transition: background 0.2s;
}

.chat-settings-drawer__switch-slider::before {
  content: '';
  position: absolute;
  width: 22px;
  height: 22px;
  left: 2px;
  bottom: 2px;
  background: var(--sa-bg-primary, #ffffff);
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.chat-settings-drawer__switch input:checked + .chat-settings-drawer__switch-slider {
  background: var(--sa-accent, #007aff);
}

.chat-settings-drawer__switch input:checked + .chat-settings-drawer__switch-slider::before {
  transform: translateX(18px);
}
</style>
