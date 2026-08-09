<template>
  <L3PageLayout class="general-settings">
    <div class="general-settings__body" :data-mounted="mounted">
      <!-- ── 主题组（浅色/深色/跟随系统） ── -->
      <div class="general-settings__group">
        <div class="general-settings__group-header">
          <span class="general-settings__group-title">主题</span>
          <span class="general-settings__group-desc">选择应用外观</span>
        </div>
        <div class="theme-row">
          <div class="theme-segmented" role="radiogroup" aria-label="主题">
            <button
              v-for="t in themeOptions"
              :key="t.value"
              class="theme-segmented__item"
              :class="{ selected: theme === t.value }"
              role="radio"
              :aria-checked="theme === t.value"
              @click="setTheme(t.value)"
            >{{ t.label }}</button>
          </div>
        </div>
      </div>

      <!-- ── 快捷键配置组 ── -->
      <div class="general-settings__group">
        <div class="general-settings__group-header">
          <span class="general-settings__group-title">快捷键</span>
          <span class="general-settings__group-desc">按下新组合键即可修改，Esc 取消</span>
        </div>
        <div
          v-for="s in shortcuts"
          :key="s.key"
          class="shortcut-row"
          :class="{ capturing: capturingKey === s.key }"
          @click="startCapture(s)"
        >
          <div class="shortcut-row__info">
            <span class="shortcut-row__label">{{ s.label }}</span>
            <span class="shortcut-row__desc">{{ s.description }}</span>
          </div>
          <div class="shortcut-row__value">
            <span v-if="capturingKey === s.key" class="shortcut-row__capturing">输入新快捷键…</span>
            <span v-else class="shortcut-row__keys">
              <span v-for="(part, i) in shortcutParts(s.value)" :key="i" class="keycap">{{ part }}</span>
            </span>
            <button
              v-if="s.value !== DEFAULT_RECORD && s.key === 'shortcut.record'"
              class="shortcut-row__reset"
              title="恢复默认"
              @click.stop="resetShortcut(s)"
            >恢复默认</button>
          </div>
        </div>
      </div>
    </div>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { L3PageLayout } from '@/renderer/components'
import { showErrorToast } from '@/renderer/utils/notification-utils'
import { applyTheme, type ThemePreference } from '@/renderer/utils/theme'

interface ShortcutItem {
  key: string
  label: string
  description: string
  value: string
}

const DEFAULT_RECORD = 'ctrl+b'

const shortcuts = ref<ShortcutItem[]>([])
const capturingKey = ref<string | null>(null)
/** 页面进入动画标记（挂载后置 true 触发 stagger transition） */
const mounted = ref(false)

/* ── 主题 ── */
const themeOptions: Array<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]
const theme = ref<ThemePreference>('light')

async function setTheme(value: ThemePreference): Promise<void> {
  theme.value = value
  applyTheme(value)
  try {
    await window.api.generalSettings.set('theme', value)
  } catch {
    showErrorToast({ code: 'theme:save:error', message: '主题保存失败' })
  }
}

/** 格式化快捷键显示 → 键帽数组（ctrl+backquote → ['Ctrl', '`']） */
function shortcutParts(value: string): string[] {
  return value.split('+').map((part) => {
    if (part === 'ctrl') return 'Ctrl'
    if (part === 'shift') return 'Shift'
    if (part === 'alt') return 'Alt'
    if (part === 'meta') return '⌘'
    if (part === 'backquote') return '`'
    return part.length === 1 ? part.toUpperCase() : part
  })
}

async function load(): Promise<void> {
  try {
    const { settings, shortcuts: list } = await window.api.generalSettings.get()
    shortcuts.value = list
    const saved = settings['theme'] as ThemePreference | undefined
    if (saved === 'dark' || saved === 'system' || saved === 'light') {
      theme.value = saved
    }
  } catch {
    showErrorToast({ code: 'shortcut:load:error', message: '读取通用设置失败' })
  }
}

/** 捕获新快捷键：监听一次按键组合（keydown 后 keyup 结束） */
function startCapture(item: ShortcutItem): void {
  capturingKey.value = item.key
}

function onKeyDown(e: KeyboardEvent): void {
  if (!capturingKey.value) return
  e.preventDefault()
  e.stopPropagation()
  // Esc 取消捕获
  if (e.key === 'Escape') {
    capturingKey.value = null
    return
  }
  // 至少需要一个修饰键（防误设单键）
  if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
    showErrorToast({ code: 'shortcut:invalid:no_modifier', message: '快捷键至少需要包含一个修饰键（Ctrl/Shift/Alt）' })
    return
  }
  const parts: string[] = []
  if (e.ctrlKey) parts.push('ctrl')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  if (e.metaKey) parts.push('meta')
  // 主键：backquote（`）或字母数字
  const key = e.key.toLowerCase()
  if (key === '`' || key === 'backquote') {
    parts.push('backquote')
  } else if (/^[a-z0-9]$/.test(key)) {
    parts.push(key)
  } else {
    showErrorToast({ code: 'shortcut:invalid:unsupported_key', message: '仅支持字母、数字或反引号（`）作为快捷键主键' })
    return
  }
  const value = parts.join('+')
  const targetKey = capturingKey.value
  capturingKey.value = null
  void saveShortcut(targetKey, value)
}

async function saveShortcut(key: string, value: string): Promise<void> {
  try {
    await window.api.generalSettings.set(key, value)
    const item = shortcuts.value.find((s) => s.key === key)
    if (item) item.value = value
    showInfo('快捷键已保存')
  } catch {
    showErrorToast({ code: 'shortcut:save:error', message: '保存快捷键失败' })
  }
}

async function resetShortcut(item: ShortcutItem): Promise<void> {
  try {
    await window.api.generalSettings.reset(item.key)
    item.value = DEFAULT_RECORD
    showInfo('已恢复默认快捷键')
  } catch {
    showErrorToast({ code: 'shortcut:reset:error', message: '恢复默认失败' })
  }
}

function showInfo(message: string): void {
  window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'tip', message } }))
}

onMounted(() => {
  void load()
  // 下一帧置 true——触发 stagger 进入动画（避免首帧即终态）
  requestAnimationFrame(() => {
    mounted.value = true
  })
  window.addEventListener('keydown', onKeyDown, true)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown, true)
})
</script>

<style scoped>
/* ── 设计基调：emil-design-eng 打磨（自定义 ease-out 曲线、<300ms、只动 transform/opacity） ── */
.general-settings__body {
  padding: 20px;
  max-width: 560px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 进入动画：分组 stagger（30ms 间隔，ease-out 300ms）——动画只放父容器带动子 */
.general-settings__group {
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 300ms cubic-bezier(0.23, 1, 0.32, 1), transform 300ms cubic-bezier(0.23, 1, 0.32, 1);
}
.general-settings__body[data-mounted='true'] .general-settings__group {
  opacity: 1;
  transform: translateY(0);
}
.general-settings__body[data-mounted='true'] .general-settings__group:nth-child(2) {
  transition-delay: 40ms;
}

@media (prefers-reduced-motion: reduce) {
  .general-settings__group {
    opacity: 1;
    transform: none;
    transition: none;
  }
}

/* ── 组卡片（Apple HIG 轻量设置分组） ── */
.general-settings__group {
  background: var(--sa-bg-primary, #ffffff);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  overflow: hidden;
}

.general-settings__group-header {
  padding: 14px 16px 6px;
}

.general-settings__group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
}

.general-settings__group-desc {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--sa-text-tertiary, #aeaeb2);
}

/* ── 主题 Segmented（选中态 transition + 按压反馈） ── */
.theme-row {
  padding: 8px 16px 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.theme-segmented {
  display: inline-flex;
  padding: 2px;
  background: var(--sa-bg-secondary, #f5f5f7);
  border-radius: 8px;
  gap: 2px;
}

.theme-segmented__item {
  height: 28px;
  padding: 0 14px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
  color: var(--sa-text-secondary, #48484a);
  cursor: pointer;
  /* 指定属性过渡（禁 all）；选中态 180ms ease-out 即时反馈 */
  transition: background-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    box-shadow 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
  font-family: inherit;
}

/* 按压反馈：物理缩进（emil：按钮必须响应按压） */
.theme-segmented__item:active {
  transform: scale(0.97);
}

@media (hover: hover) and (pointer: fine) {
  .theme-segmented__item:hover {
    color: var(--sa-text-primary, #1d1d1f);
  }
}

.theme-segmented__item.selected {
  background: var(--sa-bg-elevated, #ffffff);
  color: var(--sa-text-primary, #1d1d1f);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  font-weight: 500;
}

/* ── 快捷键行 ── */
.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition: background-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

@media (hover: hover) and (pointer: fine) {
  .shortcut-row:hover {
    background: var(--sa-bg-secondary, #f5f5f7);
  }
}

.shortcut-row:active {
  transform: scale(0.99);
}

/* 捕获态：整行 accent 淡色 + 呼吸提示 */
.shortcut-row.capturing {
  background: rgba(0, 122, 255, 0.06);
}

.shortcut-row__label {
  font-size: 13px;
  color: var(--sa-text-primary, #1d1d1f);
}

.shortcut-row__desc {
  display: block;
  margin-top: 1px;
  font-size: 11px;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.shortcut-row__value {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* 键帽（macOS 风格：圆角小块 + 细边 + 轻阴影——快捷键值的"看不见的细节"） */
.shortcut-row__keys {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.keycap {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 500;
  color: var(--sa-text-secondary, #48484a);
  background: var(--sa-bg-secondary, #f5f5f7);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-bottom-width: 2px;
  border-radius: 5px;
  font-variant-numeric: tabular-nums;
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.shortcut-row:active .keycap {
  transform: translateY(1px);
}

/* 捕获态：蓝色文字提示 */
.shortcut-row__capturing {
  font-size: 13px;
  color: var(--sa-accent, #007aff);
}

/* 恢复默认：文本链接（低调）+ 按压反馈 */
.shortcut-row__reset {
  font-size: 11px;
  color: var(--sa-accent, #007aff);
  background: none;
  border: none;
  padding: 3px 6px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

@media (hover: hover) and (pointer: fine) {
  .shortcut-row__reset:hover {
    background: rgba(0, 122, 255, 0.08);
  }
}

.shortcut-row__reset:active {
  transform: scale(0.97);
}

/* ── 手机模式（767px 断点）：压缩内边距，避免拥挤 ── */
@media (max-width: 767px) {
  .general-settings__body {
    padding: 12px;
    gap: 12px;
  }

  .general-settings__group-header {
    padding: 12px 14px 4px;
  }

  .theme-row {
    padding: 8px 14px 10px;
  }

  .shortcut-row {
    padding: 10px 14px;
  }

  .theme-segmented {
    width: 100%;
  }

  .theme-segmented__item {
    flex: 1;
    padding: 0 8px;
  }
}
</style>
