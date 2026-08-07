<template>
  <L3PageLayout class="general-settings">
    <div class="general-settings__body">
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

      <!-- ── 快捷键配置组（未来其他快捷键放同一组） ── -->
      <div class="general-settings__group">
        <div class="general-settings__group-header">
          <span class="general-settings__group-title">快捷键</span>
          <span class="general-settings__group-desc">按下新组合键即可修改，Esc 取消</span>
        </div>
        <div v-for="s in shortcuts" :key="s.key" class="shortcut-row" @click="startCapture(s)">
          <div class="shortcut-row__info">
            <span class="shortcut-row__label">{{ s.label }}</span>
            <span class="shortcut-row__desc">{{ s.description }}</span>
          </div>
          <div class="shortcut-row__value">
            <span v-if="capturingKey === s.key" class="shortcut-row__capturing">输入新快捷键…</span>
            <span v-else class="shortcut-row__keys">{{ formatShortcut(s.value) }}</span>
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
    showErrorToast({ code: 'THEME_SAVE_ERROR', message: '主题保存失败' })
  }
}

/** 格式化快捷键显示（ctrl+backquote → Ctrl + `） */
function formatShortcut(value: string): string {
  return value
    .split('+')
    .map((part) => {
      if (part === 'ctrl') return 'Ctrl'
      if (part === 'shift') return 'Shift'
      if (part === 'alt') return 'Alt'
      if (part === 'backquote') return '`'
      return part.length === 1 ? part.toUpperCase() : part
    })
    .join(' + ')
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
    showErrorToast({ code: 'SHORTCUT_ERROR', message: '读取通用设置失败' })
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
    showErrorToast({ code: 'SHORTCUT_ERROR', message: '快捷键至少需要包含一个修饰键（Ctrl/Shift/Alt）' })
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
    showErrorToast({ code: 'SHORTCUT_ERROR', message: '仅支持字母、数字或反引号（`）作为快捷键主键' })
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
    showErrorToast({ code: 'SHORTCUT_ERROR', message: '保存快捷键失败' })
  }
}

async function resetShortcut(item: ShortcutItem): Promise<void> {
  try {
    await window.api.generalSettings.reset(item.key)
    item.value = DEFAULT_RECORD
    showInfo('已恢复默认快捷键')
  } catch {
    showErrorToast({ code: 'SHORTCUT_ERROR', message: '恢复默认失败' })
  }
}

function showInfo(message: string): void {
  window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'tip', message } }))
}

onMounted(() => {
  void load()
  window.addEventListener('keydown', onKeyDown, true)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown, true)
})
</script>

<style scoped>
/* 主题 Segmented（HIG Segmented Controls：容器 bg-secondary + 选中白底） */
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
  transition: background 0.15s var(--sa-ease), color 0.15s var(--sa-ease);
  font-family: inherit;
}

.theme-segmented__item:hover {
  color: var(--sa-text-primary, #1d1d1f);
}

.theme-segmented__item.selected {
  background: var(--sa-bg-elevated, #ffffff);
  color: var(--sa-text-primary, #1d1d1f);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  font-weight: 500;
}

/* ── Apple HIG：轻量设置分组（对齐 macOS System Settings） ── */
.general-settings__body {
  padding: 20px;
  max-width: 560px;
  width: 100%;
}

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

/* 行：整行点击捕获，右侧纯文本快捷键值 */
.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition: background 0.15s;
}

.shortcut-row:hover {
  background: var(--sa-bg-secondary, #f5f5f7);
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
  gap: 8px;
  flex-shrink: 0;
}

/* 快捷键值：纯文本（非按钮框） */
.shortcut-row__keys {
  font-size: 13px;
  color: var(--sa-text-secondary, #48484a);
  font-variant-numeric: tabular-nums;
}

/* 捕获态：蓝色文字提示 */
.shortcut-row__capturing {
  font-size: 13px;
  color: var(--sa-accent, #007aff);
}

/* 恢复默认：文本链接（低调） */
.shortcut-row__reset {
  font-size: 11px;
  color: var(--sa-accent, #007aff);
  background: none;
  border: none;
  padding: 2px 4px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}

.shortcut-row__reset:hover {
  background: rgba(0, 122, 255, 0.08);
}
</style>
