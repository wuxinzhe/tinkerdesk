<template>
  <!-- 注意：SettingsDetailView 已套 L3PageLayout——此处用普通 div（避免嵌套双重 padding） -->
  <div class="general-settings">
    <div class="general-settings__body" :data-mounted="mounted">
      <!-- 页头：彩色渐变图标徽章 + 标题（iOS Settings 风格）——在窄列内与其他页对齐 -->
      <SaPageHero
        icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><rect x=&quot;3&quot; y=&quot;5&quot; width=&quot;18&quot; height=&quot;14&quot; rx=&quot;2&quot;/><line x1=&quot;7&quot; y1=&quot;9&quot; x2=&quot;7&quot; y2=&quot;9&quot;/><line x1=&quot;12&quot; y1=&quot;9&quot; x2=&quot;12&quot; y2=&quot;9&quot;/><line x1=&quot;17&quot; y1=&quot;9&quot; x2=&quot;17&quot; y2=&quot;9&quot;/><line x1=&quot;7&quot; y1=&quot;15&quot; x2=&quot;17&quot; y2=&quot;15&quot;/></svg>"
        gradient="linear-gradient(135deg, #8e9eff 0%, #5b6cff 100%)"
        title="通用设置"
        desc="主题与快捷键等全局偏好"
      />

      <!-- ── 主题组（浅色/深色/跟随系统） ── -->
      <div class="general-settings__group">
        <div class="general-settings__group-header">
          <span class="general-settings__group-title">主题</span>
          <span class="general-settings__group-desc">选择应用外观</span>
        </div>
        <div class="theme-row">
          <div class="theme-picker" role="radiogroup" aria-label="主题">
            <button
              v-for="t in themes"
              :key="t.id"
              class="theme-picker__item"
              :class="{ selected: theme === t.id }"
              role="radio"
              :aria-checked="theme === t.id"
              :title="t.description ?? ''"
              @click="setTheme(t.id)"
            >
              <span class="theme-picker__swatch" :style="{ background: t.swatch ?? t.light['--tk-accent'] }" />
              <span class="theme-picker__name">{{ t.name }}</span>
            </button>
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
            >
              恢复默认
            </button>
          </div>
        </div>
        <!-- 录音快捷键的全局生效开关（仅 shortcut.record 行） -->
        <div v-if="shortcuts.some((s) => s.key === 'shortcut.record')" class="shortcut-row shortcut-row--switch" @click="toggleRecordGlobal">
          <div class="shortcut-row__info">
            <span class="shortcut-row__label">全局生效</span>
            <span class="shortcut-row__desc">焦点在其他应用时，快捷键也能开始/结束录音</span>
          </div>
          <div class="shortcut-row__value">
            <button
              class="switch"
              :class="{ on: recordGlobal }"
              role="switch"
              :aria-checked="recordGlobal"
              @click.stop="toggleRecordGlobal"
            >
              <span class="switch__knob" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { SaPageHero } from '@/renderer/components'
import { showErrorToast, showInfoToast } from '@/renderer/utils/notification-utils'
import { applyTheme } from '@/renderer/utils/theme'
import { invalidateRecordShortcut } from '@/renderer/utils/shortcut-cache'
import { THEMES } from '@/renderer/styles/themes'

interface ShortcutItem {
  key: string
  label: string
  description: string
  value: string
}

const DEFAULT_RECORD = 'ctrl+b'

const shortcuts = ref<ShortcutItem[]>([])
const capturingKey = ref<string | null>(null)
/** 录音快捷键全局生效开关（settings['shortcut.recordGlobal']） */
const recordGlobal = ref(false)
/** 页面进入动画标记（挂载后置 true 触发 stagger transition） */
const mounted = ref(false)

/* ── 主题 ── */

/** 主题模板（styles/themes 注册表——平铺：浅色/深色/海洋/森林……新增自动出现） */
const themes = THEMES
const theme = ref('light')

async function setTheme(id: string): Promise<void> {
  theme.value = id
  applyTheme(id)
  try {
    await window.api.generalSettings.set('theme', id)
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
    recordGlobal.value = settings['shortcut.recordGlobal'] === 'true'
    const saved = settings['theme'] as string | undefined
    if (saved && THEMES.some((t) => t.id === saved)) {
      theme.value = saved
    }
  } catch {
    showErrorToast({ code: 'shortcut:load:error', message: '读取通用设置失败' })
  }
}

/** 切换录音快捷键全局生效（保存设置——main 侧同步注册/注销 globalShortcut） */
async function toggleRecordGlobal(): Promise<void> {
  recordGlobal.value = !recordGlobal.value
  try {
    await window.api.generalSettings.set('shortcut.recordGlobal', recordGlobal.value ? 'true' : 'false')
    showInfoToast(recordGlobal.value ? '已开启全局生效（其他应用窗口也能用录音快捷键）' : '已关闭全局生效')
  } catch {
    showErrorToast({ code: 'shortcut:global:save:error', message: '保存全局生效设置失败' })
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
    // 缓存失效——ChatInput 下次挂载重新读
    invalidateRecordShortcut()
  } catch {
    showErrorToast({ code: 'shortcut:save:error', message: '保存快捷键失败' })
  }
}

async function resetShortcut(item: ShortcutItem): Promise<void> {
  try {
    await window.api.generalSettings.reset(item.key)
    item.value = DEFAULT_RECORD
    showInfo('已恢复默认快捷键')
    // 缓存失效——ChatInput 下次挂载重新读
    invalidateRecordShortcut()
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
  padding: 0;
  max-width: 680px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 全局生效开关行（Switch——CSS 绘制：轨道 + 滑块，非 unicode 字符） */
.shortcut-row--switch {
  cursor: pointer;
}
.switch {
  width: 44px;
  height: 24px;
  border-radius: 12px;
  border: none;
  padding: 2px;
  background: var(--tk-border, rgba(127, 127, 127, 0.4));
  transition: background 200ms cubic-bezier(0.23, 1, 0.32, 1);
  cursor: pointer;
  flex-shrink: 0;
}
.switch.on {
  background: var(--tk-accent, #3b82f6);
}
.switch__knob {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}
.switch.on .switch__knob {
  transform: translateX(20px);
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
  background: var(--tk-bg-primary);
  /* emil：大圆角 + 分层阴影（浮起而非框住）+ 极淡边框 */
  border: 1px solid var(--tk-border-card);
  border-radius: var(--tk-radius-xl);
  box-shadow: var(--tk-shadow-card);
  overflow: hidden;
}

.general-settings__group-header {
  padding: 14px 16px 6px;
}

.general-settings__group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tk-text-primary);
}

.general-settings__group-desc {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--tk-text-tertiary);
}

/* ── 主题 Segmented（选中态 transition + 按压反馈） ── */
.theme-row {
  padding: 8px 16px 12px;
  border-top: 1px solid var(--tk-border);
}

.theme-segmented {
  display: inline-flex;
  padding: 2px;
  background: var(--tk-bg-secondary);
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
  color: var(--tk-text-secondary);
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
    color: var(--tk-text-primary);
  }
}

.theme-segmented__item.selected {
  background: var(--tk-bg-elevated);
  color: var(--tk-text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  font-weight: 500;
}

/* ── 主题选择（平铺卡片——swatch 色块 + 名称） ── */

.theme-picker {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.theme-picker__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 8px;
  border: 1px solid var(--tk-border);
  border-radius: 9px;
  background: var(--tk-bg-secondary);
  cursor: pointer;
  transition: border-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.theme-picker__item:active {
  transform: scale(0.97);
}

@media (hover: hover) and (pointer: fine) {
  .theme-picker__item:hover {
    border-color: var(--tk-accent);
  }
}

.theme-picker__item.selected {
  border-color: var(--tk-accent);
  background: var(--tk-bg-primary);
  box-shadow: 0 0 0 1px var(--tk-accent);
}

.theme-picker__swatch {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
}

.theme-picker__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--tk-text-primary);
  white-space: nowrap;
}

/* ── 快捷键行 ── */
.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 16px;
  border-top: 1px solid var(--tk-border);
  cursor: pointer;
  transition: background-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

@media (hover: hover) and (pointer: fine) {
  .shortcut-row:hover {
    background: var(--tk-bg-secondary);
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
  color: var(--tk-text-primary);
}

.shortcut-row__desc {
  display: block;
  margin-top: 1px;
  font-size: 11px;
  color: var(--tk-text-tertiary);
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
  color: var(--tk-text-secondary);
  background: var(--tk-bg-secondary);
  border: 1px solid var(--tk-border);
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
  color: var(--tk-accent);
}

/* 恢复默认：文本链接（低调）+ 按压反馈 */
.shortcut-row__reset {
  font-size: 11px;
  color: var(--tk-accent);
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
    padding: 0;
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
