<template>
  <!-- 设置抽屉（锚定输入行 row——bottom: calc(100% + 6px) 永远在输入行上方；
       panel 撑高 chat-input 不影响——row 始终在顶部） -->
  <div class="chat-settings-drawer" :class="{ 'chat-settings-drawer--open': open }">
    <!-- toggle（在 row 上方——常显把手） -->
    <button
      class="chat-settings-drawer__toggle"
      :class="{ 'chat-settings-drawer__toggle--open': open }"
      :title="open ? '收起设置' : '展开设置'"
      @click="open = !open"
    >
      <svg
        class="chat-settings-drawer__arrow"
        :class="{ 'chat-settings-drawer__arrow--open': open }"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
    <!-- 主体（grid 0fr→1fr 折叠——向上生长；收起只露 toggle） -->
    <div class="chat-settings-drawer__row">
      <div class="chat-settings-drawer__row-inner">
        <div class="chat-settings-drawer__fields">
          <div class="chat-settings-drawer__field">
            <span class="chat-settings-drawer__field-label">模型</span>
            <select
              class="chat-settings-drawer__select"
              :value="currentMainId || ''"
              :disabled="models.length === 0"
              @change="onModelChange"
            >
              <option v-if="models.length === 0" value="">
                无模型
              </option>
              <option v-for="m in models" :key="m.id" :value="m.id">
                {{ m.modelName }}
              </option>
            </select>
          </div>
          <div class="chat-settings-drawer__field">
            <span class="chat-settings-drawer__field-label">推理深度</span>
            <div
              ref="rangeRef"
              class="chat-settings-drawer__range"
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
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

const open = ref(false)

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
})
</script>

<style scoped>
/* ── 设置抽屉（锚定输入行 row——层级关系天然跟随，无 JS 测量） ── */

/* 根：absolute 相对 .chat-input-wrap（relative）——bottom: 100% 锚定 wrap 顶 = 输入行顶 */
.chat-settings-drawer {
  position: absolute;
  right: 16px;
  bottom: 100%;
  z-index: 9;                 /* 下层（被输入框压住）——收起时主体藏入输入行后 */
  display: flex;
  flex-direction: column;
  align-items: center;
  width: fit-content;
  max-width: calc(100vw - 32px);
}

/* toggle（在主体上方——常显把手） */
.chat-settings-drawer__toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--tk-border);
  border-bottom: none;
  border-radius: 9px 9px 0 0;
  background: var(--tk-bg-elevated);
  color: var(--tk-text-tertiary);
  cursor: pointer;
  z-index: 1;              /* 盖过 row-inner 的 top 描边——连接处无缝 */
  margin-bottom: -3px;     /* 向下覆盖 border-top——toggle 与主体视觉连续 */
  transition: color 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.chat-settings-drawer__toggle--open {
  color: var(--tk-accent);
}

@media (hover: hover) and (pointer: fine) {
  .chat-settings-drawer__toggle:hover {
    color: var(--tk-accent);
  }
}

/* 箭头（SVG chevron——旋转动画） */
.chat-settings-drawer__arrow {
  transition: transform 220ms cubic-bezier(0.23, 1, 0.32, 1);
}
.chat-settings-drawer__arrow--open {
  transform: rotate(180deg);
}

/* 主体（grid 0fr→1fr 折叠——emil 真实高度插值；收起 0fr 只露 toggle） */
.chat-settings-drawer__row {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 260ms cubic-bezier(0.23, 1, 0.32, 1);
}
.chat-settings-drawer--open .chat-settings-drawer__row {
  grid-template-rows: 1fr;
}
.chat-settings-drawer__row-inner {
  overflow: hidden;
  min-height: 0;
  border-radius: 8px 8px 0 0;  /* 顶部圆角（fields 随裁剪呈现）——下方角贴输入行 */
  border-right: 1px solid var(--tk-border);
  border-left: 1px solid var(--tk-border);
}
/* 顶部描边只在展开时添加（收起时 row 折叠 0fr——不应露出一条线） */
.chat-settings-drawer--open .chat-settings-drawer__row-inner {
  border-top: 1px solid var(--tk-border);
}

/* 字段容器（一行横排——标题在控件左侧——间距 16px）
   卡片从输入行向上生长：顶部圆角由 toggle（9 9 0 0）提供——底部方角贴输入行 */
.chat-settings-drawer__fields {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--tk-bg-elevated);
  box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.12);
  padding: 10px;
}

/* 手机模式（≤767px）：设置选项从并列改堆叠——每个 field 独占一行 */
@media (max-width: 767px) {
  .chat-settings-drawer__fields {
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
  color: var(--tk-text-secondary);
  white-space: nowrap;
}

.chat-settings-drawer__select {
  min-width: 96px;
  max-width: 140px;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--tk-border);
  border-radius: 7px;
  background: var(--tk-bg-primary);
  font-size: 11px;
  color: var(--tk-text-primary);
  outline: none;
}

.chat-settings-drawer__select:focus {
  border-color: var(--tk-accent);
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
  background: var(--tk-border);
}

.chat-settings-drawer__range-fill {
  height: 100%;
  border-radius: 8px;
  background: var(--tk-accent);
}

.chat-settings-drawer__range-thumb {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  border-radius: 6px;      /* 圆角长方形 */
  background: #ffffff;
  border: 1px solid var(--tk-accent);
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
  background: var(--tk-border);
  border-radius: 13px;
  transition: background-color 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.chat-settings-drawer__switch-slider::before {
  content: '';
  position: absolute;
  width: 22px;
  height: 22px;
  left: 2px;
  bottom: 2px;
  background: var(--tk-bg-primary);
  border-radius: 50%;
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.chat-settings-drawer__switch input:checked + .chat-settings-drawer__switch-slider {
  background: var(--tk-accent);
}

.chat-settings-drawer__switch input:checked + .chat-settings-drawer__switch-slider::before {
  transform: translateX(18px);
}
</style>
