<template>
  <L3PageLayout class="general-settings">
    <div class="general-settings__body">
      <!-- ── 快捷键配置组（未来其他快捷键放同一组） ── -->
      <div class="general-settings__group">
        <div class="general-settings__group-header">
          <span class="general-settings__group-title">快捷键</span>
          <span class="general-settings__group-desc">按下新组合键即可修改，Esc 取消</span>
        </div>
        <div v-for="s in shortcuts" :key="s.key" class="shortcut-row">
          <div class="shortcut-row__info">
            <span class="shortcut-row__label">{{ s.label }}</span>
            <span class="shortcut-row__desc">{{ s.description }}</span>
          </div>
          <div class="shortcut-row__control">
            <button
              class="shortcut-row__key"
              :class="{ capturing: capturingKey === s.key }"
              @click="startCapture(s)"
            >
              <template v-if="capturingKey === s.key">按新快捷键…</template>
              <template v-else>{{ formatShortcut(s.value) }}</template>
            </button>
            <button
              v-if="s.value !== DEFAULT_RECORD && s.key === 'shortcut.record'"
              class="shortcut-row__reset"
              title="恢复默认"
              @click="resetShortcut(s)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
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

interface ShortcutItem {
  key: string
  label: string
  description: string
  value: string
}

const DEFAULT_RECORD = 'ctrl+backquote'

const shortcuts = ref<ShortcutItem[]>([])
const capturingKey = ref<string | null>(null)

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
    const { shortcuts: list } = await window.api.generalSettings.get()
    shortcuts.value = list
  } catch {
    showErrorToast({ code: 'SHORTCUT_ERROR', message: '读取快捷键配置失败' })
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
.general-settings__body {
  padding: 20px;
  max-width: 560px;
  width: 100%;
}

.general-settings__group {
  background: var(--sa-bg-primary, #ffffff);
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 10px;
  overflow: hidden;
}

.general-settings__group-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--sa-border, #d2d2d7);
}

.general-settings__group-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
}

.general-settings__group-desc {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--sa-border, #d2d2d7);
}
.shortcut-row:last-child {
  border-bottom: none;
}

.shortcut-row__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--sa-text-primary, #1d1d1f);
}

.shortcut-row__desc {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.shortcut-row__control {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.shortcut-row__key {
  min-width: 96px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 6px;
  background: var(--sa-bg-primary, #ffffff);
  font-size: 12px;
  color: var(--sa-text-primary, #1d1d1f);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.shortcut-row__key:hover {
  border-color: var(--sa-accent, #007aff);
}

.shortcut-row__key.capturing {
  border-color: var(--sa-accent, #007aff);
  background: rgba(0, 122, 255, 0.08);
  color: var(--sa-accent, #007aff);
}

.shortcut-row__reset {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--sa-text-tertiary, #aeaeb2);
  cursor: pointer;
}
.shortcut-row__reset:hover {
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-accent, #007aff);
}
</style>
